// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  coverageOf,
  listWallets,
  type ConnectedWallet,
  type WalletFamily,
  type WalletOption,
} from './wallet.js'

const STORAGE_KEY = 'x402interop.wallets'
const FAMILY_TITLE: Record<WalletFamily, string> = {
  evm: 'EVM networks',
  sui: 'Sui',
  solana: 'Solana',
}
const FAMILY_ORDER: WalletFamily[] = ['evm', 'sui', 'solana']

/** Public display info only. Live signers are never persisted. */
export interface RememberedWallet {
  id: string
  family: WalletFamily
  address: string
  name: string
  icon?: string
  networks: string[]
}

type Listener = (active: ConnectedWallet | undefined, all: ConnectedWallet[]) => void

const listeners = new Set<Listener>()
const live = new Map<string, ConnectedWallet>()
let activeId: string | undefined

export function rememberedWallets(): RememberedWallet[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as RememberedWallet[]) : []
  } catch {
    return []
  }
}

export function connectedWallets(): ConnectedWallet[] {
  return [...live.values()]
}

export function connectedWallet(): ConnectedWallet | undefined {
  return activeId ? live.get(activeId) : undefined
}

export function onWalletChange(listener: Listener): void {
  listeners.add(listener)
  listener(connectedWallet(), connectedWallets())
}

function emit(): void {
  for (const listener of listeners) listener(connectedWallet(), connectedWallets())
}

function remember(wallet: ConnectedWallet): void {
  const others = rememberedWallets().filter((item) => item.id !== wallet.id)
  const entry: RememberedWallet = {
    id: wallet.id,
    family: wallet.family,
    address: wallet.address,
    name: wallet.name,
    networks: wallet.networks,
    ...(wallet.icon ? { icon: wallet.icon } : {}),
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...others, entry]))
}

function forget(id: string): void {
  const kept = rememberedWallets().filter((item) => item.id !== id)
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(kept))
}

function addConnection(wallet: ConnectedWallet): void {
  live.set(wallet.id, wallet)
  remember(wallet)
  activeId = wallet.id
  emit()
}

export function useWallet(id: string): void {
  if (!live.has(id)) return
  activeId = id
  emit()
}

export function removeWallet(id: string): void {
  live.delete(id)
  forget(id)
  if (activeId === id) activeId = live.keys().next().value
  emit()
}

export function disconnectAll(): void {
  live.clear()
  activeId = undefined
  sessionStorage.removeItem(STORAGE_KEY)
  emit()
}

function iconFor(name: string, icon?: string): HTMLElement {
  if (icon && (icon.startsWith('data:image/') || icon.startsWith('https://'))) {
    const img = document.createElement('img')
    img.className = 'wallet-icon'
    img.alt = ''
    img.src = icon
    img.width = 36
    img.height = 36
    return img
  }
  const mark = document.createElement('span')
  mark.className = 'wallet-mark'
  mark.setAttribute('aria-hidden', 'true')
  mark.textContent = name.charAt(0).toUpperCase()
  return mark
}

function textBlock(name: string, coverage: string): HTMLElement {
  const block = document.createElement('span')
  const title = document.createElement('span')
  title.className = 'wallet-option__name'
  title.textContent = name
  const detail = document.createElement('span')
  detail.className = 'wallet-option__coverage'
  detail.textContent = coverage
  block.append(title, detail)
  return block
}

function smallButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.className = 'wallet-option__action'
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    onClick()
  })
  return button
}

/**
 * Opens the wallet popup. Resolves with the active wallet once one is chosen
 * (or immediately if one is already active and `manage` is false). Rejects if
 * the popup is closed without a connection.
 */
export function pickWallet(options: { manage?: boolean } = {}): Promise<ConnectedWallet> {
  return new Promise((resolve, reject) => {
    const dialog = document.createElement('dialog')
    dialog.className = 'wallet-dialog'
    dialog.setAttribute('aria-labelledby', 'wallet-dialog-title')

    const head = document.createElement('div')
    head.className = 'wallet-dialog__head'
    const heading = document.createElement('h2')
    heading.id = 'wallet-dialog-title'
    heading.textContent = 'Connect a wallet'
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'wallet-dialog__close'
    close.setAttribute('aria-label', 'Close')
    close.textContent = '×'
    head.append(heading, close)

    const body = document.createElement('div')
    body.className = 'wallet-dialog__body'
    const intro = document.createElement('p')
    intro.className = 'muted wallet-dialog__intro'
    intro.textContent =
      'One EVM connection covers every EVM network. Each write is signed in your wallet, and nothing but your public address is kept on this device.'
    const connectedSection = document.createElement('div')
    connectedSection.className = 'wallet-section'
    const detectedSection = document.createElement('div')
    detectedSection.className = 'wallet-section'
    const status = document.createElement('p')
    status.className = 'wallet-dialog__status'
    status.setAttribute('role', 'status')
    body.append(intro, connectedSection, detectedSection, status)
    dialog.append(head, body)
    document.body.append(dialog)

    let settled = false
    const finish = (wallet: ConnectedWallet) => {
      if (settled) return
      settled = true
      dialog.close()
      resolve(wallet)
    }
    const cancel = () => {
      dialog.close()
      if (settled) return
      settled = true
      const active = connectedWallet()
      if (active) resolve(active)
      else reject(new Error('Wallet connection cancelled'))
    }
    close.addEventListener('click', cancel)
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      cancel()
    })
    dialog.addEventListener('close', () => dialog.remove())

    const section = (parent: HTMLElement, label: string): HTMLElement => {
      const title = document.createElement('div')
      title.className = 'wallet-section__label'
      title.textContent = label
      const list = document.createElement('div')
      list.className = 'wallet-list'
      parent.append(title, list)
      return list
    }

    const renderConnected = () => {
      connectedSection.replaceChildren()
      const connections = connectedWallets()
      if (connections.length === 0) return
      const list = section(connectedSection, 'Connected')
      for (const wallet of connections) {
        const row = document.createElement('div')
        row.className = `wallet-option${wallet.id === activeId ? ' wallet-option--active' : ''}`
        row.append(iconFor(wallet.name, wallet.icon), textBlock(wallet.name, coverageOf(wallet.networks)))
        const actions = document.createElement('span')
        actions.className = 'wallet-option__actions'
        actions.append(
          wallet.id === activeId
            ? smallButton('In use', () => undefined)
            : smallButton('Use', () => {
                useWallet(wallet.id)
                finish(wallet)
              }),
          smallButton('Remove', () => removeWallet(wallet.id)),
        )
        row.append(actions)
        list.append(row)
      }
    }

    const renderDetected = (options: WalletOption[]) => {
      detectedSection.replaceChildren()
      if (options.length === 0) {
        status.textContent =
          'No supported wallet extension found. Install MetaMask, Trust Wallet, Slush, Phantom, or Solflare, then reload.'
        return
      }
      const connectedIds = new Set(connectedWallets().map((wallet) => wallet.id))
      const remembered = new Set(rememberedWallets().map((item) => item.id))
      let shown = 0
      for (const family of FAMILY_ORDER) {
        const group = options.filter(
          (option) => option.family === family && !connectedIds.has(option.id),
        )
        if (group.length === 0) continue
        const list = section(detectedSection, FAMILY_TITLE[family])
        for (const option of group) {
          shown += 1
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'wallet-option'
          button.append(
            iconFor(option.name, option.icon),
            textBlock(option.name, coverageOf(option.networks)),
          )
          const action = document.createElement('span')
          action.className = 'wallet-option__action'
          action.textContent = remembered.has(option.id) ? 'Reconnect' : 'Connect'
          button.append(action)
          button.addEventListener('click', () => {
            status.classList.remove('error')
            status.textContent = `Connecting to ${option.name}…`
            option
              .connect()
              .then((wallet) => {
                addConnection(wallet)
                status.textContent = ''
                finish(wallet)
              })
              .catch((error: unknown) => {
                status.classList.add('error')
                status.textContent = error instanceof Error ? error.message : String(error)
              })
          })
          list.append(button)
        }
      }
      if (shown === 0) {
        status.textContent = 'Every detected wallet is already connected.'
      }
    }

    const existing = connectedWallet()
    if (existing && !options.manage) {
      dialog.remove()
      resolve(existing)
      return
    }

    renderConnected()
    status.textContent = 'Looking for installed wallets…'
    dialog.showModal()
    void listWallets().then((found) => {
      status.textContent = ''
      renderDetected(found)
    })
  })
}

/** Returns the active wallet, opening the popup if none is connected. */
export async function ensureWallet(options: { manage?: boolean } = {}): Promise<ConnectedWallet> {
  return pickWallet(options)
}
