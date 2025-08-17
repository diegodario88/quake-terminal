#!/bin/sh
SCRIPTDIR=`dirname $0`
xgettext  --from-code=UTF-8 -k_ -kN_  -o Quake-Terminal.pot "$SCRIPTDIR"/../src/*.js "$SCRIPTDIR"/../src/schemas/*.xml

for fn in *.po; do
	msgmerge -U "$fn" Quake-Terminal.pot
done
