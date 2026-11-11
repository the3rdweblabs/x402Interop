// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]
// Site behaviour: mobile menu, code tabs, copy buttons, scroll reveal, and docs search.
// Everything degrades to plain links when JavaScript is off.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ---- Mobile menu ---- */

const menuToggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]')
const menuPanel = document.querySelector<HTMLElement>('[data-menu-panel]')

function setMenu(open: boolean): void {
  if (!menuToggle || !menuPanel) return
  menuPanel.dataset.open = String(open)
  menuToggle.setAttribute('aria-expanded', String(open))
  menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
  document.body.classList.toggle('is-locked', open)
}

menuToggle?.addEventListener('click', () => setMenu(menuPanel?.dataset.open !== 'true'))
menuPanel?.addEventListener('click', (event) => {
  const target = event.target
  if (target instanceof Element && target.closest('a, [data-search-open]')) setMenu(false)
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuPanel?.dataset.open === 'true') {
    setMenu(false)
    menuToggle?.focus()
  }
})
window.matchMedia('(min-width: 961px)').addEventListener('change', (event) => {
  if (event.matches) setMenu(false)
})

/* ---- Tabs (landing code samples) ---- */

document.querySelectorAll<HTMLElement>('[data-tabs]').forEach((root) => {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
  const select = (tab: HTMLButtonElement, focus: boolean) => {
    for (const other of tabs) {
      const on = other === tab
      other.setAttribute('aria-selected', String(on))
      other.tabIndex = on ? 0 : -1
      const panel = document.getElementById(other.getAttribute('aria-controls') ?? '')
      if (panel) panel.hidden = !on
    }
    if (focus) tab.focus()
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab, false))
    tab.addEventListener('keydown', (event) => {
      let next: number | null = null
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
      if (next === null) return
      event.preventDefault()
      const target = tabs[next]
      if (target) select(target, true)
    })
  })
})

/* ---- Copy buttons (landing blocks and docs code) ---- */

function addCopyButton(block: HTMLElement, pre: HTMLElement): void {
  const button =
    block.querySelector<HTMLButtonElement>('[data-copy]') ?? document.createElement('button')
  if (!button.isConnected) {
    button.className = 'code__copy'
    button.type = 'button'
    button.dataset.copy = ''
    button.textContent = 'Copy'
    block.append(button)
  }
  button.addEventListener('click', async () => {
    const text = pre.textContent ?? ''
    try {
      await navigator.clipboard.writeText(text)
      button.textContent = 'Copied'
    } catch {
      button.textContent = 'Select and copy'
    }
    window.setTimeout(() => (button.textContent = 'Copy'), 1600)
  })
}

document.querySelectorAll<HTMLElement>('.tabs__panel .code').forEach((block) => {
  const pre = block.querySelector<HTMLElement>('pre')
  if (pre) addCopyButton(block, pre)
})

document.querySelectorAll<HTMLElement>('.prose pre').forEach((pre) => {
  const wrapper = document.createElement('div')
  wrapper.className = 'code'
  pre.replaceWith(wrapper)
  wrapper.append(pre)
  addCopyButton(wrapper, pre)
})

/* ---- Scroll reveal ---- */

const revealables = document.querySelectorAll<HTMLElement>('.reveal')
if (reduceMotion || !('IntersectionObserver' in window)) {
  revealables.forEach((element) => element.classList.add('is-in'))
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-in')
        observer.unobserve(entry.target)
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  )
  revealables.forEach((element) => observer.observe(element))
}

/* ---- Search (Pagefind index, built after `astro build`) ---- */

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
document.querySelectorAll<HTMLElement>('[data-shortcut]').forEach((element) => {
  element.textContent = isMac ? '⌘K' : 'Ctrl K'
})

interface PagefindResult {
  data(): Promise<{ url: string; meta: { title?: string }; excerpt: string }>
}
interface Pagefind {
  search(query: string): Promise<{ results: PagefindResult[] }>
}

let pagefind: Pagefind | undefined
let dialog: HTMLDialogElement | undefined

function buildDialog(): HTMLDialogElement {
  const element = document.createElement('dialog')
  element.className = 'search-dialog'
  element.setAttribute('aria-label', 'Search the docs')
  element.innerHTML = `
    <input class="search-dialog__input" type="search" placeholder="Search the docs" aria-label="Search the docs" aria-controls="search-results" autocomplete="off" />
    <ul class="search-dialog__results" id="search-results" role="listbox"></ul>
    <p class="search-dialog__status" role="status">Type to search.</p>`
  document.body.append(element)
  element.addEventListener('click', (event) => {
    if (event.target === element) element.close()
  })
  return element
}

async function loadIndex(): Promise<Pagefind | undefined> {
  if (pagefind) return pagefind
  try {
    const url = '/pagefind/pagefind.js'
    pagefind = (await import(/* @vite-ignore */ url)) as Pagefind
  } catch {
    pagefind = undefined
  }
  return pagefind
}

async function runSearch(query: string, results: HTMLElement, status: HTMLElement): Promise<void> {
  if (!query.trim()) {
    results.replaceChildren()
    status.textContent = 'Type to search.'
    return
  }
  const index = await loadIndex()
  if (!index) {
    results.replaceChildren()
    status.textContent = 'Search is available in the built site.'
    return
  }
  const found = (await index.search(query)).results.slice(0, 12)
  const items = await Promise.all(found.map((result) => result.data()))
  results.replaceChildren(
    ...items.map((item) => {
      const li = document.createElement('li')
      const link = document.createElement('a')
      link.href = item.url
      const title = document.createElement('strong')
      title.textContent = item.meta.title ?? item.url
      const excerpt = document.createElement('small')
      excerpt.innerHTML = item.excerpt
      link.append(title, excerpt)
      li.append(link)
      return li
    }),
  )
  status.textContent =
    items.length === 0 ? 'No matches.' : `${items.length} result${items.length === 1 ? '' : 's'}`
}

function openSearch(): void {
  dialog ??= buildDialog()
  const input = dialog.querySelector<HTMLInputElement>('input')
  const results = dialog.querySelector<HTMLElement>('#search-results')
  const status = dialog.querySelector<HTMLElement>('.search-dialog__status')
  if (!input || !results || !status) return
  dialog.showModal()
  input.focus()
  let timer = 0
  input.oninput = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => void runSearch(input.value, results, status), 120)
  }
}

document.querySelectorAll<HTMLButtonElement>('[data-search-open]').forEach((button) => {
  button.addEventListener('click', openSearch)
})
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    openSearch()
  }
})
