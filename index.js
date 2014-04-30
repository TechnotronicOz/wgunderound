var q               = require('q'),
    http            = require('http'),
    url             = require('url'),
    RateLimiter     = require('limiter').RateLimiter,
    rateCount       = 9,
    rateTime        = 'minute',
    limiter         = new RateLimiter(rateCount, rateTime),
    redis           = require('redis'),
    client          = redis.createClient(),
    cacheTime       = 600,
    cacheExpire     = 6000;

module.exports = Weather;

function Weather(apiKey, settings) {
    var args = Array.prototype.slice.call(arguments, 2),
        features = [];

    if (args.length === 1 && args[0].indexOf(',') > -1) {
        args = args[0].split(',');
    }

    args.forEach(function(arg) {
        features.push(arg);
    });

    settings = settings || {};
    settings = {
        lang: settings.lang || 'EN',
        pws: settings.pws || '1',
        bestfct: settings.bestfct || '1'
    };

    this.apiKey = apiKey;
    this.settings = urlOptionize(settings);
    this.features = features.join('/');
}

function urlOptionize(obj) {
    return JSON.stringify(obj).replace(/["{}]/g,'').replace(/,/g, '/');
}

function encodeCacheKey(location, lookup) {
    return location + '-' + lookup; // WA/Seattle-conditions
}

function cacheWeather(cacheKey, weather) {
    client.hmset(cacheKey, weather);
    client.expire(cacheKey, cacheExpire);
}


Weather.prototype.query = function(location) {
    var deferred = q.defer(),
        options, endpoint;

    options = {
        protocol: 'http',
        hostname: 'api.wunderground.com',
        pathname: ['api', this.apiKey, this.features, this.settings, 'q', location].join('/'),
        agent: false
    };

    endpoint = url.format(options) + '.json';

    var lookupType = this.features;
    var key = encodeCacheKey(location, lookupType);

    client.hgetall(key, function(err, reply) {
        if (err) {
            console.log('Cache error: %s', err);
            return false;
        }

        var timeDiff = 0;

        if (reply) {
            timeDiff = Math.round((Date.now() - reply.timestamp) / 1000);
            if (timeDiff < cacheTime && reply.locale == location && reply.lookupType === lookupType) {
                console.log('ding');
                deferred.resolve(JSON.parse(reply.data));
            } else {
                callApi();
            }
        } else {
            callApi();
        }
    });
    

    function callApi() {
        limiter.removeTokens(1, function(err, remainingRequests) {
            if (err || remainingRequests < 1) {
                console.log('remaining requests:', remainingRequests);
                deferred.reject(new Error({
                    status_code: 500,
                    status_text: 'To many calls to the API'
                }));
            } else {
                http.get(endpoint, function(res) {
                    var data = [];

                    res
                        .on('data', function(chunk) {
                            data.push(chunk);
                        })
                        .on('end', function() {
                            data = data.join('').trim();
                            var result;
                            try {
                                result = JSON.parse(data);
                            } catch(e) {
                                result = { status_code: 500, status_text: 'JSON parse failed' };
                                deferred.reject(new Error(result));
                            }

                            cacheWeather(key, {
                                timestamp: Date.now(), 
                                locale: location,
                                lookupType: lookupType, 
                                data: JSON.stringify(result)
                            });
                            
                            deferred.resolve(result);
                        });
                    //end res
                }).on('error', function(err) {
                    deferred.reject(new Error(err));
                });
            } // end if err
        }); //end api lookup 
    } //end function callApi()

    return deferred.promise;
};