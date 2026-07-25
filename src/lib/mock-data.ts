export const MOCK_SPEAKERS = [
  {
    id: "maria-garcia",
    name: "Maria Garcia",
    bio: "Senior Frontend Engineer con 8 anos de experiencia",
    photo_url: "",
    company: "Google",
    role: "Staff Engineer",
    topics: ["Web", "Angular", "TypeScript"],
    social_links: { linkedin: "https://linkedin.com/in/example" },
    talk_ids: [],
  },
  {
    id: "carlos-lopez",
    name: "Carlos Lopez",
    bio: "Cloud Architect y GDE en Google Cloud",
    photo_url: "",
    company: "AWS",
    role: "Solutions Architect",
    topics: ["Cloud", "Kubernetes", "DevOps"],
    social_links: {},
    talk_ids: [],
  },
  {
    id: "ana-torres",
    name: "Ana Torres",
    bio: "ML Engineer especializada en NLP",
    photo_url: "",
    company: "Meta",
    role: "ML Engineer",
    topics: ["AI", "Machine Learning", "Python"],
    social_links: { github: "https://github.com/example" },
    talk_ids: [],
  },
];

export const MOCK_EVENTS = [
  {
    id: "devfest-preview",
    title: "DevFest Preview 2026",
    description: "Evento de preview para desarrollo",
    date: "2026-06-15T09:00:00",
    end_time: "05:00 PM",
    venue: "Universidad Nacional",
    venue_address: "Av Principal 123",
    venue_map_url: "",
    image_url: "",
    topics: ["AI", "Cloud", "Web"],
    speaker_ids: ["maria-garcia"],
    registration_url: "",
    materials: {},
    agenda: [],
  },
];

export const MOCK_TEAM = [
  {
    id: "dev-user-1",
    name: "Juan Preview",
    role: "Leadership",
    photo_url: "",
    bio: "Organizador de ejemplo",
    social_links: { linkedin: "https://linkedin.com" },
    type: "organizer" as const,
    tags: ["Cloud", "Python"],
  },
  {
    id: "dev-user-2",
    name: "Laura Preview",
    role: "Technology",
    photo_url: "",
    bio: "Miembro de ejemplo",
    social_links: {},
    type: "member" as const,
    tags: ["React", "TypeScript"],
  },
];

export const MOCK_SPONSORS = [
  {
    name: "Google",
    logo_url: "",
    url: "https://google.com",
    sector: "Tecnologia",
    description: "Sponsor principal de ejemplo",
    featured: true,
  },
  {
    name: "GitHub",
    logo_url: "",
    url: "https://github.com",
    sector: "Software",
    description: "Sponsor de ejemplo",
    featured: false,
  },
];

export const MOCK_STATS = {
  total_members: 1000,
  total_events: 50,
  total_talks: 32,
  total_speakers: 25,
  years_active: 10,
  total_organizers: 7,
  developers_mentored: 200,
  total_sponsors: 15,
  annual_support: "$50k",
  sponsored_events: 100,
  developers_reached: 5000,
  active_volunteers: 50,
  volunteer_hours: 1500,
  events_supported: 100,
  volunteer_areas: 9,
  updated_at: new Date().toISOString(),
};

const NOW_SECONDS = Math.floor(Date.now() / 1000);

export const MOCK_USERS = [
  {
    uid: "dev-admin",
    email: "admin@preview.dev",
    displayName: "Admin Preview",
    photoURL: "",
    role: "admin",
    status: "active",
    grants: [],
    revocations: [],
    lastLoginAt: { _seconds: NOW_SECONDS },
  },
  {
    uid: "dev-organizer",
    email: "organizadora@preview.dev",
    displayName: "Organizadora Preview",
    photoURL: "",
    role: "organizer",
    status: "active",
    grants: [],
    revocations: [],
    lastLoginAt: { _seconds: NOW_SECONDS - 3600 },
  },
  {
    // Voluntaria: sin permisos globales; solo opera donde esté asignada.
    uid: "dev-volunteer",
    email: "voluntario@preview.dev",
    displayName: "Voluntario Preview",
    photoURL: "",
    role: "volunteer",
    status: "active",
    grants: [],
    revocations: [],
    lastLoginAt: { _seconds: NOW_SECONDS - 86400 },
  },
  {
    // Externo con un permiso puntual y con caducidad.
    uid: "dev-contributor",
    email: "externa@preview.dev",
    displayName: "Colaboradora Externa",
    photoURL: "",
    role: "contributor",
    status: "active",
    grants: [
      {
        permission: "events:read",
        scope: "*",
        expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
        grantedBy: "dev-admin",
        reason: "Revisión de la agenda del DevFest",
      },
    ],
    revocations: [],
    lastLoginAt: { _seconds: NOW_SECONDS - 172800 },
  },
  {
    uid: "dev-suspended",
    email: "suspendido@preview.dev",
    displayName: "Cuenta Suspendida",
    photoURL: "",
    role: "organizer",
    status: "suspended",
    grants: [],
    revocations: [],
    lastLoginAt: { _seconds: NOW_SECONDS - 604800 },
  },
];

export const MOCK_ACCESS_REQUESTS = [
  {
    uid: "req-1",
    email: "nueva.colaboradora@example.com",
    displayName: "Nueva Colaboradora",
    photoURL: "",
    requestedRole: "contributor",
    motivo:
      "Trabajo en Android y me gustaría proponer una charla sobre Compose para el próximo DevFest.",
    links: "https://github.com/ejemplo",
    eventSlug: null,
    status: "pending",
    createdAt: { _seconds: NOW_SECONDS - 3600 },
  },
  {
    uid: "req-2",
    email: "voluntario.puerta@example.com",
    displayName: "Voluntario de Puerta",
    photoURL: "",
    requestedRole: "volunteer",
    motivo: "Puedo ayudar con el registro de asistentes el día del evento.",
    links: "",
    eventSlug: "devfest-2026",
    status: "pending",
    createdAt: { _seconds: NOW_SECONDS - 86400 },
  },
];

export const MOCK_INVITATIONS = [
  {
    id: "inv-1",
    emailLower: "persona.invitada@example.com",
    role: "organizer",
    expiresAt: new Date(Date.now() + 10 * 86400_000).toISOString(),
    usedAt: null,
    usedBy: null,
    revokedAt: null,
    createdBy: "dev-admin",
    createdAt: { _seconds: NOW_SECONDS - 7200 },
  },
  {
    id: "inv-2",
    emailLower: "ya.acepto@example.com",
    role: "volunteer",
    expiresAt: new Date(Date.now() + 3 * 86400_000).toISOString(),
    usedAt: { _seconds: NOW_SECONDS - 3600 },
    usedBy: "dev-volunteer",
    revokedAt: null,
    createdBy: "dev-admin",
    createdAt: { _seconds: NOW_SECONDS - 172800 },
  },
];

export const MOCK_AUDIT = [
  {
    id: "a1",
    action: "user.role.change",
    performedBy: "dev-admin",
    targetId: "dev-volunteer",
    targetType: "user",
    details: {
      newRole: "volunteer",
      previousRole: "member",
      reason: "Apoyo en puerta para el DevFest 2026",
    },
    timestamp: { _seconds: NOW_SECONDS - 1800 },
  },
  {
    id: "a2",
    action: "user.status.change",
    performedBy: "dev-admin",
    targetId: "dev-suspended",
    targetType: "user",
    details: {
      newStatus: "suspended",
      previousStatus: "active",
      reason: "Salida del equipo organizador",
    },
    timestamp: { _seconds: NOW_SECONDS - 7200 },
  },
  {
    id: "a3",
    action: "event.update",
    performedBy: "dev-organizer",
    targetId: "devfest-2026",
    targetType: "event",
    details: { title: "DevFest ICA 2026" },
    timestamp: { _seconds: NOW_SECONDS - 10800 },
  },
];

export const MOCK_FORMS = [
  {
    id: "preview-form",
    name: "Formulario de Preview",
    spreadsheet_id: "mock",
    sheet_name: "Sheet1",
    is_public: true,
    created_at: new Date().toISOString(),
  },
];

export const MOCK_FORM_RESPONSES = {
  headers: ["Nombre", "Email", "Empresa", "Rol", "Telefono"],
  rows: [
    ["Maria Garcia", "maria@example.com", "Google", "Engineer", "+51 999999"],
    ["Carlos Lopez", "carlos@example.com", "AWS", "Architect", "+51 888888"],
    ["Ana Torres", "ana@example.com", "Meta", "ML Engineer", "+51 777777"],
  ],
};

export const MOCK_LOCATIONS = [
  {
    id: "loc-utp-ica",
    name: "Universidad Tecnológica Del Perú (UTP) - Sede Ica",
    address: "Av. Ayabaca S/N, Ica 11001",
    map_url: "https://www.google.com/maps/place/UTP+Ica",
    map_embed: "",
    createdAt: { _seconds: Math.floor(Date.now() / 1000) },
    createdBy: "dev-admin",
  },
];
