node 'default' {
  class { 'newrelic':
    license => 'ddac5bb88c2c9f927a24a2797b18dd1af9ec9c71',
  }

  class { 'nodejs':
    version => '0.8.8',
  }

  package { ['forever', 'uglify-js']:
    provider => 'npm',
    ensure => 'installed',
  }

  package { ['g++', 'git-core', 'imagemagick', 'make', 'mongodb', 'python']:
    ensure => 'installed'
  }

  firewall { '100 forward http to 8080':
    chain => 'PREROUTING',
    table => 'nat',
    proto  => 'tcp',
    dport  => 80,
    jump => 'REDIRECT',
    toports => 8080
  }

  firewall { '200 forward https to 8443':
    chain => 'PREROUTING',
    table => 'nat',
    dport  => 443,
    jump => 'REDIRECT',
    toports => 8443
  }

  user { 'pagetty':
    ensure  => 'present',
    managehome => true,
    home => '/home/pagetty',
    shell => '/bin/bash',
    password => '$6$tb36XH9y$vr5Nj74XUEYWn3HFQzmz02Qgc2FBSvJBJc3NgXO/bkYG8BVdMqMNwWI9kKQsWTrRIuSItSJh1O5n0Kseyd8Du0', # SMNIqj39a.d
  }

  ssh_authorized_key { 'pagetty_rsa':
    ensure => present,
    key    => 'AAAAB3NzaC1yc2EAAAADAQABAAABAQCmX1meHPgKSn47LpJI20fr2YqSsB5KBzeXQTXtV0Nsb6gkAY3c6kXVrfia79Wh+Vi+zoDaSQJovO2hUDkWRj4nnPs8zKYAYJDmbtrZHDroMMTJYuaggXmjw73GcTz6xCMnAHy8wSDybjbNTvQcvrqOuNmp1amE7Obg0jmvAplBa9VmR50/vpLromZQ5NIsk03mU7UESyTeFGOjIanpBEIsVfNdAVoLnhweKpy+ZskPr6OtElmZzaYqX8Ue49bhuv5GS+nvXbXkb997xaCDyj/RjGX0QuxHRs5my4eFksPuo7Sn0MyhUNMzb7Wx7BWGV1h9xI/6gP2fWSNLm/7aYeRL',
    type   => 'ssh-rsa',
    user   => 'pagetty',
  }

  file { '/home/pagetty/.ssh/pagetty_rsa':
    ensure => 'file',
    owner  => 'pagetty',
    group  => 'pagetty',
    mode   => 600,
    content => template('pagetty/pagetty_rsa.erb'),
  }

  file { '/home/pagetty/.ssh/config':
    ensure => 'file',
    owner  => 'pagetty',
    group  => 'pagetty',
    mode   => 600,
    content => template('pagetty/ssh_config.erb'),
  }

  file { '/srv/pagetty':
    ensure => 'directory',
    owner  => 'pagetty',
    group  => 'pagetty',
    mode   => 720,
  }

  file { '/var/backups/pagetty':
    ensure => 'directory',
    owner  => 'pagetty',
    group  => 'pagetty',
    mode   => 720,
  }
}