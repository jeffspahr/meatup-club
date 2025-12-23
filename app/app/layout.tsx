import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Meatup.Club - Quarterly Steakhouse Meetups',
  description: 'Private group for organizing quarterly meetups at the finest steakhouses',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
