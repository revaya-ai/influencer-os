'use client'

import type { ReactNode } from 'react'

interface TopbarProps {
  title: string
  children?: ReactNode
}

export default function Topbar({ title, children }: TopbarProps) {
  return (
    <header
      className="flex items-center justify-between px-6 border-b border-[#efefed] bg-white shrink-0"
      style={{ height: 60 }}
    >
      <h1 className="font-bold" style={{ fontSize: 19 }}>
        {title}
      </h1>
      {children && <div className="ml-auto flex items-center gap-3">{children}</div>}
    </header>
  )
}
