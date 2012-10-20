load 'deploy'

default_environment['NODE_ENV'] = "production"
default_environment['RELEASE_NAME'] = "#{release_name}"
#default_run_options[:shell] = '/bin/bash'
default_run_options[:pty] = true

set :application, "pagetty"
set :repository,  "git@github.com:picco/pagetty.git"
set :scm, :git
set :ssh_options, {:forward_agent => false}
set :deploy_to, "/srv/pagetty"
set :deploy_via, :remote_cache
set :user, "pagetty"
set :use_sudo, true

server "pagetty.com", :app, {
  :ssh_options => {
    :keys => './config/keys/pagetty_rsa'
  }
}

# Configure: Configure the server using puppet.

namespace :configure do
  task :default do
    set :user, "root"
    set :default_shell, "bash"

    sudo "hostname pagetty.com"
    sudo "apt-get install -y puppet"

    system "tar czf 'puppet.tgz' puppet/"
    upload "puppet.tgz","/tmp/puppet.tgz",:via => :scp
    system "rm puppet.tgz"

    sudo "tar xzf /tmp/puppet.tgz -C /tmp"
    sudo "rm -rf /etc/puppet"
    sudo "mv /tmp/puppet /etc/puppet"
    sudo "puppet apply /etc/puppet/manifests/site.pp"
  end
end

# Deply

namespace :deploy do
  task :stop do
    sudo "stop pagetty; true"
    sudo "stop pagetty_crawler; true"
  end

  task :start do
    sudo "start pagetty; true"
    sudo "start pagetty_crawler; true"
  end

  task :restart do
    sudo "stop pagetty; true"
    sudo "start pagetty; true"
    sudo "stop pagetty_crawler; true"
    sudo "start pagetty_crawler; true"
  end

  task :npm_install do
    run "mkdir -p #{shared_path}/node_modules"
    run "mkdir -p #{shared_path}/imagecache"
    run "ln -s #{shared_path}/node_modules #{release_path}/node_modules"
    run "rm -fr #{release_path}/imagecache"
    run "ln -s #{shared_path}/imagecache #{release_path}/imagecache"
    run "cd #{release_path} && npm install"
  end

  task :uglify do
    run "uglifyjs -mt --overwrite #{release_path}/public/scripts/libraries/pagetty.js"
  end
end

before "deploy:update_code", "backupdb"
after "deploy:finalize_update", "deploy:npm_install", "deploy:uglify"

# Backup database

namespace :backupdb do
  task :default do
    run "mongodump -d pagetty -o /var/backups/pagetty/#{release_name}"
  end
end

# Pull database from production to development

namespace :pulldb do
  task :default do
    run "rm -fr /tmp/dump";
    run "mongodump -d pagetty -o /tmp/dump"
    download "/tmp/dump","/tmp/dump", :via => :scp, :recursive => true
    system "mongorestore --drop /tmp/dump"
  end
end
