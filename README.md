# GNOME Shell Extension - Quake Terminal

![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-blue.svg)

[demo-quake-terminal.webm](https://github.com/diegodario88/quake-terminal/assets/25825145/1fecf726-66fc-4e96-bbca-1eb50ac5a450)


## Overview

The GNOME Shell Extension - Quake Terminal enhances your desktop experience by providing a Quake-style terminal that can be summoned over any workspace with ease.

This extension offers the following features:

- Quick Activation: You can summon the Quake Terminal using a single keyboard shortcut or a customizable key combination, ensuring fast and efficient access.
- Workspace Integration: The Quake Terminal remains discreetly hidden in overview mode and during Alt+Tab switching, ensuring it doesn't obstruct your workspace when not in use.
- Multi-Display Support: You have the flexibility to choose which display screen the Quake Terminal should appear on, making it even more versatile and convenient.

Future Plans
 - Adding a blur effect to the terminal actor, enhancing both aesthetics and overall appeal.
---

## Installation

### Via GNOME Extensions Website

You can easily install the extension from the GNOME Extensions website:

[![Get it on GNOME Extensions](assets/get_it_on_gnome_extensions.png)](https://extensions.gnome.org/extension/6307/quake-terminal)

### Manual Installation
If you prefer manual installation, follow these steps:

1. Clone this repository to your system:

```bash
git clone https://github.com/diegodario88/quake-terminal.git
```

2. Run the provided installation script:

```bash
./scripts/install.sh
```

## Contributing

### Setup
1. Fork this repo on github
2. Clone your new repo
3. Browse to the root of the project and run the provided installation script:
```bash
./scripts/install.sh
```
4. Login and log back in to use the extensions
5. Making changes in .gschema.xml requires running:
```bash
glib-compile-schemas quake-terminal@diegodario88.github.io/schemas/
```
6. Repeat 3. and 4. after making code changes and 5. when necessary

###  Debugging

- Watch extensions logs
```bash
journalctl -f -o cat /usr/bin/gnome-shell
```
- Watch preferences window logs
```bash
journalctl -f -o cat /usr/bin/gjs
```
- watch GSettings updates:
```bash
dconf watch /org/gnome/shell/extensions/quake-terminal/
```

## GJS docs

GNOME Shell Extensions dcoumentation and tutorial: https://gjs.guide/extensions/

## Like this Extension?

If you want to help me with this, consider buying me a coffee. :)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/Y8Y8Q12UV)

Made with ❤️
