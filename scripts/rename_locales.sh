#!/usr/bin/env sh

# For some reason, locales came in with '-' instead of '_'.
for dir in *
do
  mv $dir `echo $dir | sed -e "s/-/_/"`
done

# Also, hebrew was named 'iw' instead of 'he'.
mv iw he
