var q =             require('q'),
    http =          require('http'),
    url =           require('url'),
    RateLimiter =   require('limiter').RateLimiter,
    rateCount =     10,
    rateTime =      'minute',
    limiter =       new RateLimiter(rateCount, rateTime);

module.exports = Wgunderound;

function Wgunderound(apiKey, settings) {
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

Wgunderound.prototype.query = function(location) {
    var deferred = q.defer(),
        options, endpoint;

    options = {
        protocol: 'http',
        hostname: 'api.wunderground.com',
        pathname: ['api', this.apiKey, this.features, this.settings, 'q', location].join('/'),
        agent: false
    };

    endpoint = url.format(options) + '.json';

    limiter.removeTokens(1, function(err, remainingRequests) {
        if (err) {
            return deferred.reject(new Error({
                status_code: 500,
                status_text: 'To many calls to the api'
            }));
        }
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
                    deferred.resolve(result);
                });
            //end res
        }).on('error', function(err) {
            deferred.reject(new Error(err));
        });
    });

    return deferred.promise;
};