A Puppet Package provider for npm
=================================

Based loosely on the work done by [@boundvariable](https://github.com/boundvariable/puppet-npm)

This allows installation of node modules with npm to be puppetised. Confirmed working with node.js v0.6.14

Usage:

    # Some useful NPM modules
    package { ["connect","redis","connect-redis","jade","express","express-resource","futures","emailjs"]:
      provider=>npm,
      ensure=>installed
    }

