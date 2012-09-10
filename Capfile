load 'deploy'

default_environment['NODE_ENV'] = "production"
default_run_options[:pty] = true

set :application, "pagetty"
set :repository,  "git@github.com:picco/pagetty.git"
set :scm, :git
set :ssh_options, {:forward_agent => false}
set :deploy_to, "/srv/pagetty"
set :deploy_via, :remote_cache
set :user, "root"
set :use_sudo, false

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
  set :user, "pagetty"

  task :stop do
    run "forever stopall"
  end

  task :start do
    run "cd #{current_path} && forever start app.js"
    run "cd #{current_path} && forever start update.js"
  end

  task :restart do
    stop
    sleep 1
    start
    sleep 1
    run "forever list"
  end

  task :npm_install do
    run "mkdir -p #{shared_path}/node_modules"
    run "ln -s #{shared_path}/node_modules #{release_path}/node_modules"      
    run "cd #{release_path} && npm install"
  end
end

before "deploy:update_code", "backupdb"
after "deploy:finalize_update", "deploy:npm_install"

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
    run("mongorestore /tmp/dump")
  end
end

# Pull database

namespace :pulldb do
  task :default do
    set :user, "pagetty"

    run("rm -fr /tmp/dump");
    run("mongodump -d pagetty -o /tmp/dump")
    download("/tmp/dump","/tmp/dump", :via => :scp, :recursive => true)
    system("mongorestore /tmp/dump")
  end
end

