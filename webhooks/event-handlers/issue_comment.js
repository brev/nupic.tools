var shaValidator = require('../../utils/sha-validator');

function issueCommentHandler(payload, config, repoClient, validators, callback) {
    var prNumber = payload.issue.number;

    // Ignore comments on issues, we only want to take action on pull requests.
    if (! payload.issue.pull_request) {
        return callback();
    }

    repoClient.getLastCommitOnPullRequest(prNumber, function(err, commit) {
        var login = commit.committer.login;
        shaValidator.performCompleteValidation(
            commit.sha
          , login
          , repoClient
          , validators
          , true
          , callback
        );
    });
}

module.exports = issueCommentHandler;