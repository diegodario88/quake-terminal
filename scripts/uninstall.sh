#!/bin/bash -e

dir=~/.local/share/gnome-shell/extensions/quake-terminal@diegodario88.github.io

if [ -d $dir ]; then
  rm -rf $dir
  echo "success"
fi
