# GNOME Shell Extension - Quake Terminal

![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-blue.svg)

<p align="center">
  <img src="assets/terminal.png" width="200" alt="A black terminal emulator icon with traditional bash symbol" />
</p>

<p align="center"><em>Quake Terminal: A drop-down interface for GNOME Shell that launches your preferred terminal emulator in Quake mode, inspired by classic Quake games.</em></p>

## Demo

https://github.com/diegodario88/quake-terminal/assets/25825145/eb49d9a2-e918-4f22-8ddb-25486c2cd91b

## Settings

![Settings](assets/screenshot-settings.png)

## Overview

The GNOME Shell Extension - Quake Terminal enhances your desktop by providing a drop-down interface, inspired by classic Quake games, that can instantly launch your preferred terminal emulator over any workspace.

Key features include:

- **Quick Activation:** Instantly summon your preferred terminal emulator in Quake mode using a single keyboard shortcut or a customizable key combination for fast, efficient access.
- **Workspace Integration:** The terminal remains hidden in overview mode and during Alt+Tab switching, ensuring it never obstructs your workflow when not in use.
- **Multi-Display Support:** Choose which display the Quake Terminal appears on, offering flexibility for multi-monitor setups.
- **Custom Arguments:** Launch your terminal emulator with custom arguments when opened by Quake Terminal, allowing tailored configurations.
- **Aesthetic Animations:** Smooth sizing and animation timing for a polished user experience.

> **Note:** This extension does not provide a terminal emulator. It works with the terminal application already installed on your system.

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
npm run extension:install
```

## Contributing

### Setup

1. Fork this repo on Github
2. Clone your new repo
3. Browse to the root of the project and run the provided installation script:

```bash
npm install
```

```bash
npm run extension:install
```

4. Make your changes to the code
5. Start a nested GNOME Shell session to test your changes

```bash
dbus-run-session -- gnome-shell --nested --wayland
```

### Debugging

- Watch extensions logs

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

- Watch preferences window logs

```bash
journalctl -f -o cat /usr/bin/gjs
```

- Watch GSettings updates:

```bash
dconf watch /org/gnome/shell/extensions/quake-terminal/
```

## GJS docs

GNOME Shell Extensions documentation and tutorial: https://gjs.guide/extensions/

## Like this Extension?

If you want to help me with this, consider buying me a coffee. :)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/Y8Y8Q12UV)

---

Made with ❤️ by [Diego Dario](https://github.com/diegodario88)
