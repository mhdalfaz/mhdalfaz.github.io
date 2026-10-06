/**
 * Site identity, kept in one place so nav, footer, about, and meta tags never
 * drift apart.
 */
export const profile = {
  name: 'Muhammad Alfaz',
  shortName: 'Alfaz',
  role: 'Web Developer',
  location: 'Indonesia',
  email: 'mhdalfaz18@gmail.com',
  whatsapp: '+62 853 3466 3520',
  whatsappHref: 'https://wa.me/6285334663520',
  availability: 'Open to freelance & collaboration',
  bio: "I'm a web developer from Indonesia who builds web-based applications for office, healthcare, government, and accounting use cases. I care about shipping software that works, and about understanding the systems behind it well enough to make good architectural calls.",
} as const;

export const socials = [
  {
    label: 'GitHub',
    handle: '@mhdalfaz',
    href: 'https://github.com/mhdalfaz',
  },
  {
    label: 'LinkedIn',
    handle: 'Muhammad Alfaz',
    href: 'https://www.linkedin.com/in/muhammad-alfaz-74a173208',
  },
  {
    label: 'Instagram',
    handle: '@muh_alfaz_',
    href: 'https://www.instagram.com/muh_alfaz_',
  },
  {
    label: 'WhatsApp',
    handle: '+62 853 3466 3520',
    href: 'https://wa.me/6285334663520',
  },
] as const;

/** Primary tool groups, shown on the home page and about page. */
export const stack = [
  {
    group: 'Languages',
    items: ['PHP', 'JavaScript', 'TypeScript', 'Go', 'Java', 'SQL'],
  },
  {
    group: 'Backend',
    items: ['Laravel', 'Gin', 'REST API', 'JWT Auth', 'Redis', 'Pusher', 'Socket.IO'],
  },
  {
    group: 'Frontend',
    items: ['Next.js', 'Nuxt', 'Expo / React Native', 'Tailwind CSS', 'Bootstrap', 'PWA'],
  },
  {
    group: 'Database',
    items: ['MySQL', 'PostgreSQL', 'SQL Server', 'MongoDB', 'GORM'],
  },
  {
    group: 'Platform',
    items: ['Filament', 'Vercel', 'GitHub Actions', 'Docker', 'Google Cloud'],
  },
] as const;