/**
 * @file src/main/menu.js
 * @description Native application menu. Every item dispatches a named command
 * to the renderer via the `menu:command` channel; the renderer owns the actual
 * behaviour, so menu state (undo/redo enablement, zoom) stays in one place.
 *
 * Add a new feature to the menu by appending to {@link buildTemplate}; Copilot
 * can extend this file by following the same `send('command')` pattern.
 */

'use strict';

const { app, Menu, shell, dialog, BrowserWindow } = require('electron');

/**
 * Send a command to the focused renderer window.
 * @param {string} command
 * @param {*} [payload]
 */
function send(command, payload) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) win.webContents.send('menu:command', { command, payload });
}

/**
 * Build and install the application menu.
 * @param {{isDev: boolean, onAbout: () => void}} opts
 */
function installMenu({ isDev, onAbout }) {
  const isMac = process.platform === 'darwin';

  /** @type {import('electron').MenuItemConstructorOptions[]} */
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { label: 'Preferences…', accelerator: 'Cmd+,', click: () => send('open-preferences') },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => send('new-project'),
        },
        {
          label: 'New from Template…',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => send('open-templates'),
        },
        { type: 'separator' },
        {
          label: 'Open Project…',
          accelerator: 'CmdOrCtrl+O',
          click: () => send('open-project'),
        },
        {
          label: 'Recent Projects',
          id: 'recent',
          submenu: [{ label: 'No recent projects', enabled: false }],
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => send('save-project'),
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => send('save-project-as'),
        },
        {
          label: 'Save as Template…',
          accelerator: 'CmdOrCtrl+Alt+S',
          click: () => send('save-template'),
        },
        { type: 'separator' },
        {
          label: 'Export…',
          accelerator: 'CmdOrCtrl+E',
          click: () => send('open-export'),
        },
        {
          label: 'Quick Export PNG (2x)',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => send('quick-export'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: 'Redo', accelerator: isMac ? 'Shift+Cmd+Z' : 'Ctrl+Y', click: () => send('redo') },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', click: () => send('cut') },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', click: () => send('copy') },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', click: () => send('paste') },
        { label: 'Duplicate', accelerator: 'CmdOrCtrl+D', click: () => send('duplicate') },
        { label: 'Delete', accelerator: 'Delete', click: () => send('delete') },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => send('select-all') },
        {
          label: 'Deselect',
          accelerator: 'Escape',
          click: () => send('deselect'),
        },
        { type: 'separator' },
        { label: 'Group Selection', accelerator: 'CmdOrCtrl+G', click: () => send('group') },
        { label: 'Ungroup', accelerator: 'CmdOrCtrl+Shift+G', click: () => send('ungroup') },
        { type: 'separator' },
        {
          label: 'Bring to Front',
          accelerator: 'CmdOrCtrl+Shift+]',
          click: () => send('bring-front'),
        },
        {
          label: 'Send to Back',
          accelerator: 'CmdOrCtrl+Shift+[',
          click: () => send('send-back'),
        },
        { label: 'Lock / Unlock', accelerator: 'CmdOrCtrl+L', click: () => send('toggle-lock') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => send('zoom-in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => send('zoom-out') },
        { label: 'Fit Artboard', accelerator: 'CmdOrCtrl+0', click: () => send('zoom-fit') },
        { label: 'Actual Size (100%)', accelerator: 'CmdOrCtrl+1', click: () => send('zoom-100') },
        { type: 'separator' },
        { label: 'Toggle Grid', accelerator: "CmdOrCtrl+'", click: () => send('toggle-grid') },
        { label: 'Toggle Snap Guides', accelerator: 'CmdOrCtrl+;', click: () => send('toggle-snap') },
        { label: 'Toggle Rulers', accelerator: 'CmdOrCtrl+R', click: () => send('toggle-rulers') },
        { type: 'separator' },
        { label: 'Toggle Vault', accelerator: 'CmdOrCtrl+B', click: () => send('toggle-vault') },
        { label: 'Toggle Inspector', accelerator: 'CmdOrCtrl+Alt+B', click: () => send('toggle-inspector') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev
          ? [
              { type: 'separator' },
              { role: 'reload' },
              { role: 'toggleDevTools' },
            ]
          : []),
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ role: 'front' }] : [])],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Quick Start Guide', click: () => send('open-guide') },
        { label: 'Keyboard Shortcuts', click: () => send('open-shortcuts') },
        { type: 'separator' },
        {
          label: 'Open Asset Vault Folder',
          click: () => send('open-vault-folder'),
        },
        {
          label: 'Show Logs',
          click: () => shell.openPath(app.getPath('logs')),
        },
        { type: 'separator' },
        {
          label: 'License & Attributions',
          click: () => onAbout(),
        },
        {
          label: 'About Pagan Logo Maker',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'About Pagan Logo Maker',
              message: `Pagan Logo Maker ${app.getVersion()}`,
              detail:
                'A fully offline studio for crafting pagan, esoteric and occult logo marks.\n\n' +
                'Electron · React · Fabric.js\nAll bundled artwork is CC0 and free for commercial use.',
              buttons: ['Close'],
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Project Homepage',
          click: () => shell.openExternal('https://github.com/beltane777/pagan-logo-maker'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  return menu;
}

/**
 * Refresh the "Recent Projects" submenu.
 * @param {Array<{path: string, name: string}>} recents
 */
function updateRecents(recents) {
  const menu = Menu.getApplicationMenu();
  if (!menu) return;
  const item = menu.getMenuItemById('recent');
  if (!item) return;

  if (!recents.length) {
    item.submenu = Menu.buildFromTemplate([{ label: 'No recent projects', enabled: false }]);
    return;
  }
  item.submenu = Menu.buildFromTemplate([
    ...recents.slice(0, 10).map((r) => ({
      label: r.name,
      toolTip: r.path,
      click: () => send('open-recent', r.path),
    })),
    { type: 'separator' },
    { label: 'Clear Recent', click: () => send('clear-recents') },
  ]);
}

module.exports = { installMenu, updateRecents, send };
