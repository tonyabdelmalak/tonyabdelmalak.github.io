# Design notes: 2026 refresh

What changed and why, with the source behind each decision. Research done on 2026-11-13 (web search, links below).

## Kept on purpose
- **Navy top nav with the animated underline** that grows from the center on hover (now also marks the section you're in).
- **Skills & Tools icon grid**, now with Lucide icons and items from LinkedIn's skills and tools lists.
- **Palette**: navy #001e42, deep blue #1E3A8A, teal #14B8A6, light gray #F3F4F6, ink #111827, slate #374151. Teal stays a decorative and on-navy color; text links use a darker teal (#0F766E) because #14B8A6 on white is about 2.5:1 and fails AA.
- **Section order and structure**: hero, about, results band, projects, dashboards carousels, featured case studies, skills, certifications, reading list.

## Decisions and sources
| Decision | Source |
|---|---|
| Every tap target at least 44x44 px (buttons, carousel arrows, nav links, chat close button) | Apple Human Interface Guidelines, 44x44 pt minimum; WCAG 2.2 SC 2.5.8 (24x24 AA) and 2.5.5 (44x44 AAA) |
| Text contrast at least 4.5:1, large text 3:1, checked by axe-core on every page | WCAG 2.2 SC 1.4.3 Contrast (Minimum); WebAIM contrast guide |
| Carousels are manual only: no autoplay, swipe plus visible arrow buttons, a peek of the next card, under 8 items | NN/g, "Mobile Carousels" and "Auto-Forwarding Carousels and Accordions Annoy Users"; Smashing/Baymard carousel requirements |
| Body copy capped at about 66 characters per line | Baymard Institute, "Readability: The Optimal Line Length" (50 to 75 characters) |
| All motion is decorative and turns off with Reduce Motion; nothing hides content if scripts fail | web.dev, "Animation and motion" (prefers-reduced-motion); WCAG 2.3.3 |
| Chat header says it's an AI version of me, and the bot says so when asked | Gausen et al. 2026, "Disclosure By Design" (arXiv 2603.16874); EU AI Act and California BOT Act disclosure requirements |
| One h1 per page, real headings, skip link, landmarks, alt text on every image | WCAG 2.2 SC 1.3.1, 2.4.1, 1.1.1 |

## Personal, not a fourth product
The product sites (CareerPaver, Lumira) use Inter at heavy weights with app-style UI. This site uses Inter for reading and **Fraunces**, an editorial serif, for headings, with a real portrait in the hero. It reads like a person, not a SaaS landing page, while matching the products' spacing, radius and motion quality.

## Sources
- Apple HIG, layout and hit targets: https://developer.apple.com/design/human-interface-guidelines/layout
- W3C, What's new in WCAG 2.2: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
- WebAIM, contrast and color: https://webaim.org/articles/contrast/
- NN/g, Mobile carousels: https://www.nngroup.com/articles/mobile-carousels/
- NN/g, Designing effective carousels (video): https://www.nngroup.com/videos/carousels-websites-mobile-apps/
- Smashing Magazine (Baymard), 10 requirements for carousels: https://www.smashingmagazine.com/2016/07/ten-requirements-for-making-home-page-carousels-work-for-end-users/
- Baymard, optimal line length: https://baymard.com/blog/line-length-readability
- web.dev, animation and motion: https://web.dev/learn/accessibility/motion
- Gausen et al., Disclosure By Design: https://arxiv.org/abs/2603.16874
