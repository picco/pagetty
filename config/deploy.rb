set :application, "pagetty"
set :repository,  "git@github.com:picco/pagetty.git"
set :scm, :git
set :ssh_options, {:forward_agent => true}
set :deploy_to, "/home/pagetty/production"
set :deploy_via, :remote_cache
set :user, "root"
set :keep_releases, 10

server "pagetty.com", :app, :web, :db, {
  :ssh_options => {
    :keys => './keys/pagetty.pem'
  }
}

namespace :deploy do
  desc "Stop Forever"
  task :stop do
    run "sudo forever stopall" 
  end

  desc "Start Forever"
  task :start do
    run "cd #{current_path} && forever start app.js" 
  end

  desc "Restart Forever"
  task :restart do
    stop
    sleep 5
    start
  end

  desc "Refresh shared node_modules symlink to current node_modules"
  task :refresh_symlink do
    run "rm -rf #{current_path}/node_modules && ln -s #{shared_path}/node_modules #{current_path}/node_modules"
  end

  desc "Install node modules non-globally"
  task :npm_install do
    run "cd #{current_path} && npm install"
  end
end

after "deploy:update_code", "deploy:npm_install"

# if you want to clean up old releases on each deploy uncomment this:
# after "deploy:restart", "deploy:cleanup"

# if you're still using the script/reaper helper you will need
# these http://github.com/rails/irs_process_scripts

# If you are using Passenger mod_rails uncomment this:
# namespace :deploy do
#   task :start do ; end
#   task :stop do ; end
#   task :restart, :roles => :app, :except => { :no_release => true } do
#     run "#{try_sudo} touch #{File.join(current_path,'tmp','restart.txt')}"
#   end
# end