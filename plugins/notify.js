exports.attach = function (options) {
  var app = this;

  app.notify = {
    /**
     * Send notification on signin.
     */
    onSignin: function(user, source) {
      var msg = 'signin account:' + user.mail;
      if (source) msg += (" source:" + source);
      console.log('notify: ' + msg), this.mail(msg);
    },

    /**
     * Send notification on signup.
     */
    onSignup: function(user) {
      var msg = 'signup account:' + user.mail;
      console.log('notify: ' + msg), this.mail(msg);
    },

    /**
     * Send notification on account activation.
     */
    onActivate: function(user) {
      var msg = 'activate account:' + user.mail;
      console.log('notify: ' + msg), this.mail(msg);
    },

    /**
     * Send notification on account activation.
     */
    onAccountChange: function(user) {
      var msg = 'accountChange account:' + user.mail;
      console.log('notify: ' + msg), this.mail(msg);
    },

    /**
     * Send notification on account activation.
     */
    onPasswordReminder: function(user) {
      var msg = 'passwordReminder account:' + user.mail;
      console.log('notify: ' + msg), this.mail(msg);
    },

    /**
     * Send notification on account activation.
     */
    onAccountDelete: function(user) {
      var msg = 'accountDelete account:' + user.mail;
      console.log('notify: ' + msg), this.mail(msg);
    },

    /**
     * Send notification on account activation.
     */
    onSubscribe: function(user, channel) {
      var msg = 'subscribe account:' + user.mail + ' url:' + channel.url;
      console.log('notify: ' + msg), this.mail(msg, JSON.stringify(channel, null, 2));
    },

    /**
     * Send notification on account activation.
     */
    onUnSubscribe: function(user, channel) {
      var msg = 'unsubscribe account:' + user.mail + ' url:' + channel.url;
      console.log('notify: ' + msg), this.mail(msg);
    },

    /**
     * Send notification on account activation.
     */
    onRulesChange: function(user, channel, rule) {
      var msg = 'rulesChange account:' + user.mail + ' domain:' + channel.domain + ' url:' + channel.link;
      console.log("notify:", msg), this.mail(msg, JSON.stringify(rule, null, 2));
    },

    /**
     * Prepare and send the notification mail.
     */
    mail: function(subject, text) {
      if (app.conf.env != "development") {
        var mail = {to: app.conf.mail.logs, subject: app.conf.env + ':' + subject};

        if (text) {
          mail.text = '<pre><font face="Courier New" style="font-size: 11px">' + text + '</font></pre>';
          mail.headers = {'Content-Type': 'text/html'};
        }
  
        app.mail(mail);
      }
    }
  }
}