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
set :user, "root"
set :use_sudo, false

server "5.9.78.132", :app, {
  :ssh_options => {
    :keys => './config/keys/pagetty_rsa'
  }
}

# Configure: Configure the server using puppet.

namespace :configure do
  task :default do
    set :user, "root"
    set :default_shell, "bash"

    run("hostname pagetty.com")
    run("apt-get install -y puppet")

    system("tar czf 'puppet.tgz' puppet/")
    upload("puppet.tgz","/tmp/puppet.tgz",:via => :scp)
    system("rm puppet.tgz")
    run("tar xzf /tmp/puppet.tgz -C /tmp")
    run("rm -rf /etc/puppet")
    run("mv /tmp/puppet /etc/puppet")
    run("puppet apply /etc/puppet/manifests/site.pp")
  end
end

# Deply

namespace :deploy do
  set :user, "root"

  task :stop do
    run "stop pagetty"
    run "stop pagetty_crawler"
  end

  task :start do
    run "start pagetty"
    run "start pagetty_crawler"
  end

  task :restart do
    stop
    sleep 1
    start
    sleep 1
    run "status pagetty"
    run "status pagetty_crawler"
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
    set :user, "pagetty"

    run("mongodump -d pagetty -o /var/backups/pagetty/#{release_name}")
  end
end

# Push database

namespace :pushdb do
  task :default do
    set :user, "pagetty"

    system("rm -fr /tmp/dump");
    system("mongodump -d pagetty -o /tmp/dump")
    upload("/tmp/dump","/tmp/dump", :via => :scp, :recursive => true)
    run("mongorestore --drop /tmp/dump")
  end
end

# Pull database

namespace :pulldb do
  task :default do
    set :user, "pagetty"

    run("rm -fr /tmp/dump");
    run("mongodump -d pagetty -o /tmp/dump")
    download("/tmp/dump","/tmp/dump", :via => :scp, :recursive => true)
    system("mongorestore --drop /tmp/dump")
  end
end
