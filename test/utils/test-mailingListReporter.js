var assert = require('assert')
  , RepositoryClient = require('../../utils/repo-client')
  , proxyquire = require('proxyquire')
  , jsonUtils = require('../../utils/json')
  , jsonMock = {}
  , urlMap = proxyquire('../../handlers/mailing-list-reporter', {
        '../utils/json': jsonMock
    })
  ;

describe('mailing list handler url mapping', function() {
    it('has an entry for the /maillist* URL', function() {
        assert(Object.keys(urlMap).indexOf('/maillist*') > -1,
            'handler does not have proper url mapping');
    });
});

describe('/maillist URL handler', function() {
    var initializer = urlMap['/maillist*'];

    it('is a function with title and description', function() {
        var handler = initializer();
        assert.equal(typeof handler, 'function', 'handler initializer does not return function');
        assert.equal('Mailing List Reporter', handler.title, 'bad handler title');
        assert(typeof handler.description, 'string', 'bad handler description string');
    });

});



