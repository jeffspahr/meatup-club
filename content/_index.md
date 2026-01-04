---
title: 'Home'
date: 2023-10-24
type: landing

design:
  # Default section spacing
  spacing: "6rem"

sections:
  - block: hero
    content:
      title: Steakhouse nights, four times a year.
      text: Member-voted venues. Simple RSVPs. Zero fluff.
      primary_action:
        text: Member Login
        url: /login
        icon: arrow-right
      secondary_action:
        text: Request an invite
        url: /accept-invite
      announcement:
        text: "Next dinner drops soon."
        link:
          text: "See how it works"
          url: "/#how-it-works"
    design:
      spacing:
        padding: [0, 0, 0, 0]
        margin: [0, 0, 0, 0]
      # For full-screen, add `min-h-screen` below
      css_class: "meat-hero"
      background:
        color: "stone"
  - block: stats
    content:
      items:
        - statistic: "4x"
          description: |
            Dinners
            per year
        - statistic: "100%"
          description: |
            Member-voted
            restaurants
        - statistic: "< 60s"
          description: |
            Average
            RSVP time
    design:
      # Section background color (CSS class)
      css_class: "meat-stats"
      # Reduce spacing
      spacing:
        padding: ["1rem", 0, "1rem", 0]
  - block: features
    id: how-it-works
    content:
      title: How it works
      text: A dinner club that runs itself.
      items:
        - name: Suggest and vote
          icon: hand-thumb-up
          description: Drop restaurant ideas, vote, and let the leaderboard settle the venue.
        - name: Lock the date
          icon: calendar-days
          description: Propose dates and pick the one that works for the crew.
        - name: RSVP in seconds
          icon: chat-bubble-left-right
          description: RSVP on the web, by email, or by text.
        - name: Reminders that work
          icon: bell-alert
          description: 24-hour and 2-hour nudges with one-tap responses.
        - name: Admin control
          icon: shield-check
          description: Override RSVPs and send updates when needed.
        - name: Zero spam
          icon: lock-closed
          description: Notification-only. Opt out anytime.
  - block: cta-image-paragraph
    id: events
    content:
      items:
        - title: The dinner lineup lives here
          text: See the next venue, time, and RSVP status at a glance.
          feature_icon: check
          features:
            - "One dashboard for the next meetup"
            - "Automatic calendar invites"
            - "RSVPs sync from email and SMS"
          # Upload image to `assets/media/` and reference the filename here
          image: build-website.png
          button:
            text: View the dashboard
            url: /dashboard
        - title: Built for a real crew
          text: Meatup.Club keeps it simple: great steak, tight logistics.
          feature_icon: bolt
          features:
            - "Invite-only membership"
            - "Clear RSVP accountability"
            - "Admin overrides when needed"
          # Upload image to `assets/media/` and reference the filename here
          image: coffee.jpg
          button:
            text: Request an invite
            url: /accept-invite
    design:
      # Section background color (CSS class)
      css_class: "meat-panels"
  - block: testimonials
    content:
      title: "Member notes"
      text: "Short, blunt, and exactly how we like it."
      items:
        - name: "Johnny J."
          role: "Member"
          # Upload image to `assets/media/` and reference the filename here
          image: "testimonial-1.jpg"
          text: "One page tells me what is next. One text confirms I am in."
    design:
      spacing:
        # Reduce bottom spacing so the testimonial appears vertically centered between sections
        padding: ["6rem", 0, 0, 0]
  - block: cta-card
    id: community
    content:
      title: Ready for the next dinner?
      text: If you have a seat at the table, jump in.
      button:
        text: Member Login
        url: /login
    design:
      card:
        # Card background color (CSS class)
        css_class: "meat-cta"
        css_style: ""
---
