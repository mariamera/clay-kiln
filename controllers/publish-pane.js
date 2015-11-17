var pane = require('../services/pane'),
  edit = require('../services/edit'),
  rules = require('../validators'),
  validation = require('../services/publish-validation'),
  progress = require('../services/progress');

module.exports = function () {
  function constructor(el) {
    this.el = el;
  }

  constructor.prototype = {
    events: {
      '.publish-now click': 'onPublishNow'
    },

    onPublishNow: function () {
      pane.close();
      progress.start('green');

      return validation.validate(rules).then(function (errors) {
        if (errors.length) {
          progress.done('red');
          pane.openValidationErrors(errors);
        } else {
          return edit.publishPage()
            .then(function (url) {
              progress.done();
              progress.open('green', `Published! <a href="${url}" target="_blank">View Article</a>`);
            })
            .catch(function () {
              // note: the Error passed into this doesn't have a message, so we use a custom one
              progress.done('red');
              progress.open('red', `A server error occured. Please try again.`);
            });
        }
      });
    }
  };
  return constructor;
};
