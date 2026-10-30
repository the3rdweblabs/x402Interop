// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

export * from './types.js'
export * from './detect.js'
export * from './registry.js'

export { evmAdapter } from './evm/index.js'
export { svmAdapter } from './svm/index.js'
export { suiAdapter } from './sui/index.js'
export { nearAdapter } from './near/index.js'
export { tonAdapter } from './ton/index.js'
export { tronAdapter } from './tron/index.js'
export { xrplAdapter } from './xrpl/index.js'
export { lightningAdapter } from './lightning/index.js'

export * from './evm/index.js'
export * from './svm/index.js'
export * from './sui/index.js'
export * from './near/index.js'
export * from './ton/index.js'
export * from './tron/index.js'
export * from './xrpl/index.js'
export * from './lightning/index.js'

export { getAdapter, getAllAdapters, isSupported, supportedNetworks, supportedSchemes } from './registry.js'
export { verify, settle } from './registry.js'
