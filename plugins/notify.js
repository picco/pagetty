exports.attach = function (options) {
  var app = this;

  // Load required libraries.
  var diff = require('jsondiffpatch');

  this.notify = {
    /**
     * Send notification on signin.
     */
    onSignin: function(user) {
      this.mail('signin account:' + user.mail);
    },

    /**
     * Send notification on signup.
     */
    onSignup: function(user) {
      this.mail('signup account:' + user.mail);
    },

    /**
     * Send notification on account activation.
     */
    onActivate: function(user) {
      this.mail('activate account:' + user.mail);
    },

    /**
     * Send notification on account activation.
     */
    onAccountChange: function(user) {
      this.mail('accountChange account:' + user.mail);
    },

    /**
     * Send notification on account activation.
     */
    onPasswordReminder: function(user) {
      this.mail('passwordReminder account:' + user.mail);
    },

    /**
     * Send notification on account activation.
     */
    onAccountDelete: function(user) {
      this.mail('accountDelete account:' + user.mail);
    },

    /**
     * Send notification on account activation.
     */
    onSubscribe: function(user, channel) {
      this.mail('subscribe account:' + user.mail + ' url:' + channel.url, JSON.stringify(channel, null, 2));
    },

    /**
     * Send notification on account activation.
     */
    onUnSubscribe: function(user, channel) {
      this.mail('unsubscribe account:' + user.mail + ' url:' + channel.url);
    },

    /**
     * Send notification on account activation.
     */
    onRulesChange: function(user, channel, old_rules, new_rules) {
      var body = '';

      body += "Old rules:\n" + JSON.stringify(old_rules, null, 2) + "\n\n";
      body += "New rules:\n" + JSON.stringify(new_rules, null, 2) + "\n\n";
      body += "Rules diff\n" + JSON.stringify(diff.diff(old_rules, new_rules), null, 2) + "\n\n";
      body += "Channel after change:\n" + JSON.stringify(channel, null, 2);

      this.mail('rulesChange account:' + user.mail + ' domain:' + channel.domain + ' url:' + channel.url, body);
    },

    /**
     * Prepare and send the notification mail.
     */
    mail: function(subject, text) {
      var mail = {to: app.conf.mail.logs, subject: app.conf.env + ':' + subject};

      if (text) {
        mail.text = '<pre><font face="Courier New" style="font-size: 11px">' + text + '</font></pre>';
        mail.headers = {'Content-Type': 'text/html'};
      }

      app.mail(mail);
    }
  }
}