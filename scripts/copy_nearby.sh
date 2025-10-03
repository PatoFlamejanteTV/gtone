#!/usr/bin/env sh
MODULE=js/deps/nearby.js
scp smus.mtv:~/whispernacl/google3/blaze-bin/location/nearby/messages/js/compiled.js $MODULE
chmod 644 $MODULE
