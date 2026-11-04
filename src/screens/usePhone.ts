'use client'

import { useSyncExternalStore } from 'react'
import { PHONE_QUERY } from '../map/highlight'

/** The page's lists, one for each query, made when first asked; none without `matchMedia`. */
const lists = new Map<string, MediaQueryList | null>()
const listOf = (query: string) => {
  if (!lists.has(query))
    lists.set(query, typeof matchMedia === 'function' ? matchMedia(query) : null)
  return lists.get(query)!
}

type Subscribe = (onChange: () => void) => () => void

/** One subscribe for each query, so a render doesn't subscribe again. */
const subscribers = new Map<string, Subscribe>()
const subscribeTo = (query: string): Subscribe => {
  let subscribe = subscribers.get(query)
  if (!subscribe) {
    subscribe = (onChange) => {
      listOf(query)?.addEventListener('change', onChange)
      return () => listOf(query)?.removeEventListener('change', onChange)
    }
    subscribers.set(query, subscribe)
  }
  return subscribe
}

/**
 * Whether the page matches a media query, for a component that lays itself out by it: it renders
 * again when the answer changes. The prerendered page matches none, so a layout the first paint
 * depends on reads the width in CSS instead.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribeTo(query),
    () => listOf(query)?.matches ?? false,
    () => false,
  )
}

/**
 * Whether the page is as narrow as a phone, for a component that lays itself out differently
 * there: it renders again when the width crosses the breakpoint. The prerendered page is a
 * desktop's, so a layout the first paint depends on reads the width in CSS instead.
 */
export const usePhone = (): boolean => useMediaQuery(PHONE_QUERY)
