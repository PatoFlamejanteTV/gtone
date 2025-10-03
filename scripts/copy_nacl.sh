#!/usr/bin/env sh
MODULE_NAME=decoder_module
scp smus.mtv:~/whispernacl/google3/blaze-bin/audio/whispernet/nacl/$MODULE_NAME .
chmod 644 $MODULE_NAME
pnacl-finalize $MODULE_NAME
