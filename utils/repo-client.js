var GitHubApi = require('github'),
    Travis = require('travis-ci'),
    _ = require('underscore'),
    async = require('async'),
    log = require('./logger').logger,
    RepositoryClient;

function arraysMatch(left, right) {
    var sameValues = _.intersection(left, right);
    return sameValues.length == left.length && sameValues.length == right.length;
}

/**
 * An interface to the Github repository. Uses the Github API.
 */
function RepositoryClient(config) {
    this.user = config.username;
    this.password = config.password;
    this.org = config.organization;
    this.repo = config.repository;
    this.contributorsUrl = config.contributors;
    this.github = new GitHubApi({
        version: '3.0.0',
        timeout: 5000
    });
    this.github.authenticate({
        type: 'basic',
        username: this.user,
        password: this.password
    });
    this.travis = new Travis({ version: '2.0.0' });
    this.travis.authenticate({
        username: this.user,
        password: this.password
    }, function() {});
    // Store configured validators.
    this.validators = config.validators;
    // Store configured hooks.
    if (config.hasOwnProperty('hooks')) {
        this.hooks = config.hooks;
    } else {
        this.hooks = {};
    }
}

RepositoryClient.prototype.merge = function(head, base, callback) {
    log.log('merging ' + head + ' into ' + base + '...');
    this.github.repos.merge({
        user: this.org,
        repo: this.repo,
        base: base,
        head: head
    }, callback);
};

RepositoryClient.prototype.isBehindMaster = function(sha, callback) {
    this.github.repos.compareCommits({
        user: this.org,
        repo: this.repo,
        base: 'master',
        head: sha
    }, function(err, data) {
        if (err) {
            callback(err);
        } else {
            callback(err, data.behind_by > 0, data.behind_by);
        }
    });
};

RepositoryClient.prototype.getAllOpenPullRequests = function(callback) {
    this.github.pullRequests.getAll({
        user: this.org,
        repo: this.repo,
        state: 'open'
    }, callback);
};

RepositoryClient.prototype.getContributors = function(callback) {
    var me = this;
    me.github.repos.getContributors({
        user: me.org,
        repo: me.repo
    }, function(err, contributors) {
        if (err) {
            callback(err);
        } else {
            me._getRemainingPages(contributors, null, callback);
        }
    });
};

RepositoryClient.prototype.getCommits = function(callback) {
    var me = this;
    me.github.repos.getCommits({
        user: me.org,
        repo: me.repo
    }, function(err, commits) {
        if (err) {
            callback(err);
        } else {
            me._getRemainingPages(commits, null, callback);
        }
    });
};

RepositoryClient.prototype.getAllStatusesFor = function(sha, callback) {
    this.github.statuses.get({
        user: this.org,
        repo: this.repo,
        sha: sha
    }, function(err, statuses) {
        callback(err, (statuses || []));
    });
};

RepositoryClient.prototype.getCommit = function(sha, callback) {
    this.github.repos.getCommit({
        user: this.org,
        repo: this.repo,
        sha: sha
    }, callback);
};

RepositoryClient.prototype.rateLimit = function(callback) {
    this.github.misc.rateLimit({
        user: this.org,
        repo: this.repo
    }, callback);
};

RepositoryClient.prototype.confirmWebhookExists = function(url, events, callback) {
    var me = this;
    log.info('%s/%s web hook check', this.org, this.repo);
    this.github.repos.getHooks({
        user: this.org,
        repo: this.repo
    }, function(err, hooks) {
        var found = false,
            hookRemovers = [];
        if (err) {
            console.error(err);
            return callback(err);
        }
        log.info('Found %s webhooks', hooks.length);
        hooks.forEach(function(hook) {
            if (hook.config && url == hook.config.url) {
                // So there is a webhook for this repo, but it might not have the events we want.
                if (arraysMatch(hook.events, events)) {
                    found = true;
                } else {
                    hookRemovers.push(function(hookRemovalCallback) {
                        // Remove the old webhook
                        log.warn('Removing old webhook for %s.', url);
                        me.github.repos.deleteHook({
                            user: me.org,
                            repo: me.repo,
                            id: hook.id
                        }, hookRemovalCallback);
                    });
                }
            }
        });
        // First, remove any stale webhooks we found.
        async.parallel(hookRemovers, function(err) {
            if (err) {
                return callback(err);
            }
            if (! found) {
                me.github.repos.createHook({
                    user: me.org,
                    repo: me.repo,
                    name: 'web',
                    config: {
                        url: url
                    },
                    events: events
                }, function(err, data) {
                    if (err) {
                        return callback(err);
                    }
                    log.warn('Created web hook %s for %s, monitoring events "%s"', data.id, data.config.url, data.events.join(', '));
                    callback();
                });
            } else {
                callback();
            }
        });
    });
};

RepositoryClient.prototype.triggerTravisForPullRequest = function(pull_request_number, callback) {
    var travis = this.travis;
    log.debug('Attempting to trigger a build for' + this.toString()
        + ' PR#' + pull_request_number);
    travis.builds({
        slug: this.getRepoSlug(),
        event_type: 'pull_request'
    }, function(err, response) {
        var pr = _.find(response.builds, function(build) {
            return build.pull_request_number == pull_request_number;
        });
        if (! pr) {
            return callback(new Error('No pull request with #' + pull_request_number));
        }
        log.log("Triggering build restart for PR#" + pull_request_number);
        travis.builds.restart({ id: pr.id }, function(err, restartResp) {
            if (err) return callback(err);
            callback(null, restartResp.result)
        });
    });
};

RepositoryClient.prototype._getRemainingPages = function(lastData, allDataOld, callback) {
    var me = this,
        allData = [];
    if (allDataOld) {
        allData = allData.concat(allDataOld);
    }
    allData = allData.concat(lastData);
    me.github.getNextPage(lastData, function(error, newData){
        if (error) {
            callback(null, allData);
        } else {
            me._getRemainingPages(newData, allData, callback)
        }
    });
}

RepositoryClient.prototype.getRepoSlug = function() {
    return this.org + '/' + this.repo;
};

RepositoryClient.prototype.toString = function() {
    return this.getRepoSlug();
};

module.exports = RepositoryClient;
