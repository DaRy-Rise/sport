// Контурные иконки в духе SF Symbols (линия 1.8, скруглённые концы).
import type { ReactNode } from 'react'

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export const Icons = {
  today: () => <Svg><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></Svg>,
  diary: () => <Svg><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18v15H6.5A1.5 1.5 0 0 0 5 19.5z" /><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H18v-3" /><path d="M9 7.5h5M9 11h5" /></Svg>,
  foods: () => <Svg><path d="M12 7c-1.2-2.5-4.5-3-6.2-1.2C3.6 8 4.4 13 6.5 16.5 8 19 10 21 12 20c2 1 4-1 5.5-3.5 2.1-3.5 2.9-8.5.7-10.7C16.5 4 13.2 4.5 12 7z" /><path d="M12 7c0-2 .8-3.5 2.5-4.5" /></Svg>,
  training: () => <Svg><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" /></Svg>,
  sleep: () => <Svg><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></Svg>,
  insights: () => <Svg><path d="M4 20h16" /><path d="M7 16v-5M12 16V7M17 16v-3" /></Svg>,
  profile: () => <Svg><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" /></Svg>,
  more: () => <Svg><circle cx="5.5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="18.5" cy="12" r="1.3" fill="currentColor" /></Svg>,
  chevron: () => <svg className="chevron" viewBox="0 0 8 14" width="8" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m1 1 6 6-6 6" /></svg>,
  cloud: () => <Svg><path d="M7 18.5h10a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.7 1.3A3.4 3.4 0 0 0 7 18.5z" /></Svg>,
}
