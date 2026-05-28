/**
 * File:        apps/broker-admin/src/lib/mock-data.ts
 * Module:      broker-admin · Mock Data
 * Purpose:     Typed seed data for all broker-admin modules — ported and expanded from prototype
 *
 * Exports:
 *   - BROKER_CONFIG          — BrokerConfig
 *   - MOCK_CLIENTS           — Client[]
 *   - MOCK_IBS               — IntroducingBroker[]
 *   - MOCK_CLIENT_GROUPS     — ClientGroup[]
 *   - MOCK_INSTRUMENTS       — Instrument[]
 *   - MOCK_ORDERS            — Order[]
 *   - MOCK_TRANSACTIONS      — Transaction[]
 *   - MOCK_SURVEILLANCE      — SurveillanceAlert[]
 *   - MOCK_EXPOSURE_LIMITS   — ExposureLimit[]
 *   - MOCK_RISK_METRICS      — RiskMetric[]
 *   - MOCK_REVENUE_DATA      — RevenuePoint[]
 *   - MOCK_ACTIVITY_FEED     — ActivityEvent[]
 *   - MOCK_NOTIFICATIONS     — Notification[]
 *   - MOCK_SYSTEM_STATUS     — SystemStatus[]
 *   - MOCK_TEAM_MEMBERS      — TeamMember[]
 *   - MOCK_BONUSES           — Bonus[]
 *   - MOCK_AUDIT_LOG         — AuditLogEntry[]
 *
 * Side-effects:
 *   - none
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import type {
  AuditLogEntry,
  ActivityEvent,
  Bonus,
  BrokerConfig,
  Client,
  ClientGroup,
  ExposureLimit,
  Instrument,
  IntroducingBroker,
  Notification,
  Order,
  RevenuePoint,
  RiskMetric,
  SurveillanceAlert,
  SystemStatus,
  TeamMember,
  Transaction,
} from './types';

// ─── BROKER CONFIG ─────────────────────────────────────────────────────────────

export const BROKER_CONFIG: BrokerConfig = {
  name: 'ArcaFX Markets',
  legalName: 'ArcaFX Ltd',
  jurisdiction: 'Seychelles FSA',
  licenseNumber: 'SD052',
  currency: 'USD',
  aum: 4_200_000,
  totalClients: 1_247,
  version: '2.4.1',
  systemStatus: 'operational',
  adminUser: { name: 'Sarah Chen', role: 'Compliance Officer', lastLogin: 'Today 08:14' },
};

// ─── CLIENTS ──────────────────────────────────────────────────────────────────

export const MOCK_CLIENTS: Client[] = [
  {
    id: 'C1001', name: 'Alexander Mitchell', email: 'a.mitchell@gmail.com',
    phone: '+44 7700 900123', country: 'GB', flag: '🇬🇧',
    dob: '1985-03-14', nationality: 'British', address: '12 Kensington Rd, London W8 4SH',
    type: 'VIP', group: 'VIP', status: 'Active',
    kyc: 'Verified', kycLevel: 'Enhanced', kycExpiry: '2025-11-15',
    balance: 84_200, equity: 86_450, margin: 12_400, marginPct: 697,
    floatPnl: 2_250, openPositions: 3,
    totalDeposited: 120_000, totalWithdrawn: 35_000, bonusBalance: 500, credit: 0,
    leverage: '1:100', accountCurrency: 'USD',
    regDate: '2022-04-10', lastLogin: '2024-01-15 09:23',
    volumeMTD: 342, platform: ['Web', 'MT5'],
    suitability: 'APPROPRIATE', riskProfile: 'Aggressive',
    ib: 'IB001', tags: ['VIP', 'Whale'],
    amlScore: 12, amlStatus: 'Clear',
    notes: [{ author: 'Sarah Chen', time: '2024-01-10 11:00', text: 'Client requested leverage increase to 1:200. Denied per ESMA rules.' }],
  },
  {
    id: 'C1002', name: 'Fatima Al-Rashidi', email: 'fatima.r@outlook.com',
    phone: '+971 50 123 4567', country: 'AE', flag: '🇦🇪',
    dob: '1990-07-22', nationality: 'Emirati', address: 'DIFC, Gate Village 4, Dubai',
    type: 'Pro', group: 'Professional', status: 'Active',
    kyc: 'Verified', kycLevel: 'Standard', kycExpiry: '2026-02-28',
    balance: 52_100, equity: 51_800, margin: 8_200, marginPct: 631,
    floatPnl: -300, openPositions: 2,
    totalDeposited: 75_000, totalWithdrawn: 22_000, bonusBalance: 0, credit: 1_000,
    leverage: '1:200', accountCurrency: 'USD',
    regDate: '2022-08-20', lastLogin: '2024-01-15 07:45',
    volumeMTD: 218, platform: ['Web', 'Mobile'],
    suitability: 'APPROPRIATE', riskProfile: 'Moderate',
    ib: null, tags: ['Pro', 'Active'],
    amlScore: 8, amlStatus: 'Clear', notes: [],
  },
  {
    id: 'C1003', name: 'James Okafor', email: 'james.okafor@yahoo.com',
    phone: '+27 82 456 7890', country: 'ZA', flag: '🇿🇦',
    dob: '1978-11-05', nationality: 'South African', address: '45 Sandton Drive, Johannesburg 2196',
    type: 'Retail', group: 'Standard', status: 'Active',
    kyc: 'Verified', kycLevel: 'Basic', kycExpiry: '2025-06-30',
    balance: 12_400, equity: 11_900, margin: 1_800, marginPct: 661,
    floatPnl: -500, openPositions: 1,
    totalDeposited: 18_000, totalWithdrawn: 5_000, bonusBalance: 200, credit: 0,
    leverage: '1:100', accountCurrency: 'USD',
    regDate: '2023-01-12', lastLogin: '2024-01-14 16:30',
    volumeMTD: 45, platform: ['Web'],
    suitability: 'APPROPRIATE', riskProfile: 'Moderate',
    ib: 'IB002', tags: [], amlScore: 15, amlStatus: 'Clear', notes: [],
  },
  {
    id: 'C1004', name: 'Sophie Bergmann', email: 'sbergmann@web.de',
    phone: '+49 170 234 5678', country: 'DE', flag: '🇩🇪',
    dob: '1992-05-18', nationality: 'German', address: 'Friedrichstraße 88, 10117 Berlin',
    type: 'Retail', group: 'Standard', status: 'Pending',
    kyc: 'Pending', kycLevel: 'Basic', kycExpiry: null,
    balance: 1_500, equity: 1_500, margin: 0, marginPct: null,
    floatPnl: 0, openPositions: 0,
    totalDeposited: 1_500, totalWithdrawn: 0, bonusBalance: 0, credit: 0,
    leverage: '1:30', accountCurrency: 'USD',
    regDate: '2024-01-12', lastLogin: '2024-01-12 14:22',
    volumeMTD: 0, platform: ['Web'],
    suitability: 'PENDING', riskProfile: 'Conservative',
    ib: null, tags: ['New'], amlScore: 5, amlStatus: 'Clear',
    notes: [{ author: 'System', time: '2024-01-12 14:22', text: 'KYC documents uploaded. Awaiting review.' }],
  },
  {
    id: 'C1005', name: 'Wei Zhang', email: 'wzhang88@gmail.com',
    phone: '+65 9123 4567', country: 'SG', flag: '🇸🇬',
    dob: '1988-09-30', nationality: 'Singaporean', address: '1 Raffles Place, Singapore 048616',
    type: 'VIP', group: 'VIP', status: 'Active',
    kyc: 'Verified', kycLevel: 'Enhanced', kycExpiry: '2026-09-30',
    balance: 78_500, equity: 82_100, margin: 15_200, marginPct: 540,
    floatPnl: 3_600, openPositions: 4,
    totalDeposited: 150_000, totalWithdrawn: 70_000, bonusBalance: 1_000, credit: 0,
    leverage: '1:200', accountCurrency: 'USD',
    regDate: '2021-11-08', lastLogin: '2024-01-15 08:10',
    volumeMTD: 512, platform: ['Web', 'MT5', 'Mobile'],
    suitability: 'APPROPRIATE', riskProfile: 'Aggressive',
    ib: 'IB001', tags: ['VIP', 'Whale', 'Active'],
    amlScore: 22, amlStatus: 'Clear', notes: [],
  },
  {
    id: 'C1006', name: 'Lucas Oliveira', email: 'lucas.oliv@hotmail.com',
    phone: '+55 11 9876 5432', country: 'AU', flag: '🇦🇺',
    dob: '1995-02-14', nationality: 'Australian', address: '88 Collins St, Melbourne VIC 3000',
    type: 'Retail', group: 'Standard', status: 'Active',
    kyc: 'Verified', kycLevel: 'Standard', kycExpiry: '2025-08-15',
    balance: 8_200, equity: 8_750, margin: 1_200, marginPct: 729,
    floatPnl: 550, openPositions: 1,
    totalDeposited: 12_000, totalWithdrawn: 3_500, bonusBalance: 150, credit: 0,
    leverage: '1:100', accountCurrency: 'USD',
    regDate: '2023-03-22', lastLogin: '2024-01-15 10:05',
    volumeMTD: 88, platform: ['Mobile'],
    suitability: 'APPROPRIATE', riskProfile: 'Moderate',
    ib: 'IB003', tags: [], amlScore: 9, amlStatus: 'Clear', notes: [],
  },
  {
    id: 'C1007', name: 'Priya Sharma', email: 'priya.sharma@gmail.com',
    phone: '+44 7911 123456', country: 'GB', flag: '🇬🇧',
    dob: '1987-12-01', nationality: 'British', address: '5 Canary Wharf, London E14 5NY',
    type: 'Pro', group: 'Professional', status: 'Active',
    kyc: 'Verified', kycLevel: 'Enhanced', kycExpiry: '2025-12-01',
    balance: 34_500, equity: 33_200, margin: 5_600, marginPct: 593,
    floatPnl: -1_300, openPositions: 2,
    totalDeposited: 50_000, totalWithdrawn: 15_000, bonusBalance: 0, credit: 2_000,
    leverage: '1:200', accountCurrency: 'USD',
    regDate: '2022-06-15', lastLogin: '2024-01-14 15:40',
    volumeMTD: 156, platform: ['Web', 'MT5'],
    suitability: 'APPROPRIATE', riskProfile: 'Aggressive',
    ib: null, tags: ['Pro'], amlScore: 11, amlStatus: 'Clear', notes: [],
  },
  {
    id: 'C1008', name: 'Marc Dubois', email: 'marc.dubois@sfr.fr',
    phone: '+33 6 12 34 56 78', country: 'FR', flag: '🇫🇷',
    dob: '1980-06-25', nationality: 'French', address: '15 Rue de Rivoli, 75001 Paris',
    type: 'Retail', group: 'Standard', status: 'Dormant',
    kyc: 'Expired', kycLevel: 'Basic', kycExpiry: '2023-12-31',
    balance: 2_100, equity: 2_100, margin: 0, marginPct: null,
    floatPnl: 0, openPositions: 0,
    totalDeposited: 5_000, totalWithdrawn: 2_900, bonusBalance: 0, credit: 0,
    leverage: '1:30', accountCurrency: 'USD',
    regDate: '2022-01-08', lastLogin: '2023-09-10 12:00',
    volumeMTD: 0, platform: ['Web'],
    suitability: 'APPROPRIATE', riskProfile: 'Conservative',
    ib: null, tags: ['Inactive', 'KYC Expired'], amlScore: 6, amlStatus: 'Clear',
    notes: [{ author: 'System', time: '2024-01-01 00:00', text: 'KYC documents expired. Account restricted.' }],
  },
  {
    id: 'C1009', name: 'Tariq Hassan', email: 'tariq.h@protonmail.com',
    phone: '+971 55 987 6543', country: 'AE', flag: '🇦🇪',
    dob: '1982-04-10', nationality: 'Emirati', address: 'Jumeirah Beach Rd, Dubai',
    type: 'VIP', group: 'VIP', status: 'Active',
    kyc: 'Verified', kycLevel: 'Enhanced', kycExpiry: '2026-04-10',
    balance: 62_800, equity: 58_400, margin: 22_100, marginPct: 264,
    floatPnl: -4_400, openPositions: 5,
    totalDeposited: 200_000, totalWithdrawn: 135_000, bonusBalance: 2_000, credit: 0,
    leverage: '1:200', accountCurrency: 'USD',
    regDate: '2021-07-01', lastLogin: '2024-01-15 06:55',
    volumeMTD: 890, platform: ['Web', 'MT5'],
    suitability: 'APPROPRIATE', riskProfile: 'Aggressive',
    ib: 'IB001', tags: ['VIP', 'Whale', 'High Risk'],
    amlScore: 68, amlStatus: 'Flagged',
    notes: [
      { author: 'Sarah Chen', time: '2024-01-08 09:00', text: 'AML flag: unusual deposit pattern. Under review.' },
      { author: 'Mike Ross', time: '2024-01-09 10:30', text: 'Requested additional SOF documentation.' },
    ],
  },
  {
    id: 'C1010', name: 'Anna Kowalski', email: 'a.kowalski@wp.pl',
    phone: '+48 500 123 456', country: 'PL', flag: '🇵🇱',
    dob: '1993-08-17', nationality: 'Polish', address: 'ul. Nowy Świat 4, 00-001 Warsaw',
    type: 'Retail', group: 'Standard', status: 'Pending',
    kyc: 'Pending', kycLevel: 'Basic', kycExpiry: null,
    balance: 500, equity: 500, margin: 0, marginPct: null,
    floatPnl: 0, openPositions: 0,
    totalDeposited: 500, totalWithdrawn: 0, bonusBalance: 50, credit: 0,
    leverage: '1:30', accountCurrency: 'USD',
    regDate: '2024-01-13', lastLogin: '2024-01-13 18:44',
    volumeMTD: 0, platform: ['Mobile'],
    suitability: 'PENDING', riskProfile: 'Conservative',
    ib: 'IB004', tags: ['New'], amlScore: 4, amlStatus: 'Clear', notes: [],
  },
  {
    id: 'C1011', name: 'David Thompson', email: 'd.thompson@bigpond.com',
    phone: '+61 412 345 678', country: 'AU', flag: '🇦🇺',
    dob: '1975-01-28', nationality: 'Australian', address: '100 George St, Sydney NSW 2000',
    type: 'Pro', group: 'Professional', status: 'Active',
    kyc: 'Verified', kycLevel: 'Enhanced', kycExpiry: '2025-10-28',
    balance: 48_000, equity: 49_200, margin: 7_800, marginPct: 631,
    floatPnl: 1_200, openPositions: 2,
    totalDeposited: 80_000, totalWithdrawn: 30_000, bonusBalance: 0, credit: 0,
    leverage: '1:200', accountCurrency: 'USD',
    regDate: '2022-03-05', lastLogin: '2024-01-15 01:20',
    volumeMTD: 278, platform: ['Web', 'MT5'],
    suitability: 'APPROPRIATE', riskProfile: 'Moderate',
    ib: 'IB002', tags: ['Pro', 'Active'], amlScore: 14, amlStatus: 'Clear', notes: [],
  },
  {
    id: 'C1012', name: 'Elena Petrov', email: 'elena.petrov@mail.ru',
    phone: '+357 99 123456', country: 'CY', flag: '🇨🇾',
    dob: '1989-10-05', nationality: 'Cypriot', address: '28 Arch. Makariou III, Limassol 3105',
    type: 'Retail', group: 'Standard', status: 'Suspended',
    kyc: 'Rejected', kycLevel: 'Basic', kycExpiry: null,
    balance: 3_200, equity: 3_200, margin: 0, marginPct: null,
    floatPnl: 0, openPositions: 0,
    totalDeposited: 3_200, totalWithdrawn: 0, bonusBalance: 0, credit: 0,
    leverage: '1:100', accountCurrency: 'USD',
    regDate: '2023-11-20', lastLogin: '2023-12-01 08:15',
    volumeMTD: 0, platform: ['Web'],
    suitability: 'NOT_APPROPRIATE', riskProfile: 'Conservative',
    ib: null, tags: ['Suspended', 'KYC Rejected'], amlScore: 35, amlStatus: 'Review',
    notes: [{ author: 'Sarah Chen', time: '2023-12-01 09:00', text: 'Account suspended pending KYC re-submission. Suspected document forgery.' }],
  },
  {
    id: 'C1013', name: 'Kwame Mensah', email: 'k.mensah@gmail.com',
    phone: '+27 71 234 5678', country: 'GH', flag: '🇬🇭',
    dob: '1991-03-20', nationality: 'Ghanaian', address: 'Cape Town City Centre, Cape Town 8001',
    type: 'Retail', group: 'Standard', status: 'Active',
    kyc: 'Verified', kycLevel: 'Standard', kycExpiry: '2025-09-20',
    balance: 6_800, equity: 6_600, margin: 900, marginPct: 733,
    floatPnl: -200, openPositions: 1,
    totalDeposited: 9_000, totalWithdrawn: 2_000, bonusBalance: 100, credit: 0,
    leverage: '1:100', accountCurrency: 'USD',
    regDate: '2023-05-14', lastLogin: '2024-01-13 20:00',
    volumeMTD: 67, platform: ['Mobile'],
    suitability: 'APPROPRIATE', riskProfile: 'Moderate',
    ib: 'IB003', tags: [], amlScore: 10, amlStatus: 'Clear', notes: [],
  },
  {
    id: 'C1014', name: 'Isabella Romano', email: 'i.romano@libero.it',
    phone: '+39 335 123 4567', country: 'IT', flag: '🇮🇹',
    dob: '1994-07-11', nationality: 'Italian', address: 'Via Montenapoleone 8, 20121 Milano',
    type: 'Retail', group: 'Standard', status: 'Pending',
    kyc: 'Pending', kycLevel: 'Basic', kycExpiry: null,
    balance: 2_000, equity: 2_000, margin: 0, marginPct: null,
    floatPnl: 0, openPositions: 0,
    totalDeposited: 2_000, totalWithdrawn: 0, bonusBalance: 200, credit: 0,
    leverage: '1:30', accountCurrency: 'USD',
    regDate: '2024-01-10', lastLogin: '2024-01-10 22:10',
    volumeMTD: 0, platform: ['Web'],
    suitability: 'PENDING', riskProfile: 'Conservative',
    ib: 'IB005', tags: ['New'], amlScore: 3, amlStatus: 'Clear', notes: [],
  },
  {
    id: 'C1015', name: 'Omar Abdullah', email: 'omar.abd@hotmail.com',
    phone: '+971 52 456 7890', country: 'SA', flag: '🇸🇦',
    dob: '1983-12-25', nationality: 'Saudi', address: 'King Fahd Rd, Riyadh 12211',
    type: 'VIP', group: 'VIP', status: 'Active',
    kyc: 'Verified', kycLevel: 'Enhanced', kycExpiry: '2026-12-25',
    balance: 31_500, equity: 29_800, margin: 9_400, marginPct: 317,
    floatPnl: -1_700, openPositions: 3,
    totalDeposited: 60_000, totalWithdrawn: 28_000, bonusBalance: 500, credit: 0,
    leverage: '1:200', accountCurrency: 'USD',
    regDate: '2022-02-14', lastLogin: '2024-01-15 05:30',
    volumeMTD: 234, platform: ['Web', 'MT5'],
    suitability: 'APPROPRIATE', riskProfile: 'Aggressive',
    ib: 'IB001', tags: ['VIP'], amlScore: 28, amlStatus: 'Review',
    notes: [{ author: 'Sarah Chen', time: '2024-01-05 10:00', text: 'Margin warning sent. Client acknowledged.' }],
  },
  {
    id: 'C1016', name: 'Hannah Mueller', email: 'h.mueller@gmx.de',
    phone: '+49 176 987 6543', country: 'DE', flag: '🇩🇪',
    dob: '1996-09-03', nationality: 'German', address: 'Maximilianstraße 12, 80539 Munich',
    type: 'Retail', group: 'Standard', status: 'Active',
    kyc: 'Verified', kycLevel: 'Standard', kycExpiry: '2025-03-03',
    balance: 4_500, equity: 4_800, margin: 600, marginPct: 800,
    floatPnl: 300, openPositions: 1,
    totalDeposited: 6_000, totalWithdrawn: 1_500, bonusBalance: 0, credit: 0,
    leverage: '1:30', accountCurrency: 'USD',
    regDate: '2023-08-22', lastLogin: '2024-01-14 18:00',
    volumeMTD: 38, platform: ['Mobile'],
    suitability: 'APPROPRIATE', riskProfile: 'Conservative',
    ib: null, tags: [], amlScore: 7, amlStatus: 'Clear', notes: [],
  },
  {
    id: 'C1017', name: 'Carlos Mendez', email: 'carlos.mx@outlook.com',
    phone: '+52 55 1234 5678', country: 'MX', flag: '🇲🇽',
    dob: '1986-04-18', nationality: 'Mexican', address: 'Paseo de la Reforma 222, CDMX 06600',
    type: 'Retail', group: 'Standard', status: 'Active',
    kyc: 'Verified', kycLevel: 'Standard', kycExpiry: '2025-07-18',
    balance: 9_800, equity: 10_200, margin: 1_400, marginPct: 729,
    floatPnl: 400, openPositions: 1,
    totalDeposited: 14_000, totalWithdrawn: 4_000, bonusBalance: 250, credit: 0,
    leverage: '1:100', accountCurrency: 'USD',
    regDate: '2023-02-28', lastLogin: '2024-01-14 22:30',
    volumeMTD: 72, platform: ['Web'],
    suitability: 'APPROPRIATE', riskProfile: 'Moderate',
    ib: 'IB003', tags: [], amlScore: 11, amlStatus: 'Clear', notes: [],
  },
  {
    id: 'C1018', name: 'Yuki Tanaka', email: 'yuki.tnk@docomo.ne.jp',
    phone: '+81 90 1234 5678', country: 'JP', flag: '🇯🇵',
    dob: '1990-11-22', nationality: 'Japanese', address: '1-1-1 Shinjuku, Tokyo 160-0022',
    type: 'Pro', group: 'Professional', status: 'Active',
    kyc: 'Verified', kycLevel: 'Enhanced', kycExpiry: '2026-11-22',
    balance: 22_000, equity: 23_400, margin: 3_200, marginPct: 731,
    floatPnl: 1_400, openPositions: 2,
    totalDeposited: 35_000, totalWithdrawn: 13_000, bonusBalance: 0, credit: 0,
    leverage: '1:200', accountCurrency: 'USD',
    regDate: '2022-09-10', lastLogin: '2024-01-15 04:00',
    volumeMTD: 142, platform: ['Web', 'MT5'],
    suitability: 'APPROPRIATE', riskProfile: 'Moderate',
    ib: null, tags: ['Pro'], amlScore: 9, amlStatus: 'Clear', notes: [],
  },
  {
    id: 'C1019', name: 'Grace Osei', email: 'grace.osei@gmail.com',
    phone: '+233 20 123 4567', country: 'GH', flag: '🇬🇭',
    dob: '1998-05-30', nationality: 'Ghanaian', address: '7 Brixton High St, London SW2 1EF',
    type: 'Retail', group: 'Standard', status: 'Active',
    kyc: 'Verified', kycLevel: 'Basic', kycExpiry: '2025-05-30',
    balance: 1_800, equity: 1_750, margin: 200, marginPct: 875,
    floatPnl: -50, openPositions: 0,
    totalDeposited: 2_500, totalWithdrawn: 700, bonusBalance: 100, credit: 0,
    leverage: '1:30', accountCurrency: 'USD',
    regDate: '2023-10-15', lastLogin: '2024-01-12 20:00',
    volumeMTD: 18, platform: ['Mobile'],
    suitability: 'APPROPRIATE', riskProfile: 'Conservative',
    ib: 'IB005', tags: ['New'], amlScore: 5, amlStatus: 'Clear', notes: [],
  },
  {
    id: 'C1020', name: 'Robert van der Berg', email: 'r.vdberg@telenet.be',
    phone: '+32 475 123 456', country: 'BE', flag: '🇧🇪',
    dob: '1977-08-08', nationality: 'Belgian', address: 'Avenue Louise 54, 1050 Brussels',
    type: 'Pro', group: 'Professional', status: 'Active',
    kyc: 'Verified', kycLevel: 'Standard', kycExpiry: '2025-08-08',
    balance: 18_500, equity: 19_200, margin: 2_600, marginPct: 738,
    floatPnl: 700, openPositions: 1,
    totalDeposited: 30_000, totalWithdrawn: 11_000, bonusBalance: 0, credit: 0,
    leverage: '1:100', accountCurrency: 'USD',
    regDate: '2022-11-30', lastLogin: '2024-01-14 08:50',
    volumeMTD: 124, platform: ['Web'],
    suitability: 'APPROPRIATE', riskProfile: 'Moderate',
    ib: 'IB004', tags: ['Pro'], amlScore: 10, amlStatus: 'Clear', notes: [],
  },
];

// ─── INTRODUCING BROKERS ──────────────────────────────────────────────────────

export const MOCK_IBS: IntroducingBroker[] = [
  {
    id: 'IB001', name: 'Global FX Partners', email: 'info@globalfxpartners.com',
    country: 'AE', flag: '🇦🇪', status: 'Active',
    clientCount: 312, volumeMTD: 4_820,
    commissionMTD: 38_560, commissionTotal: 142_400, commissionRate: 8,
    tier: 'Gold', regDate: '2021-06-01', lastPayout: '2024-01-01', pendingPayout: 3_560,
  },
  {
    id: 'IB002', name: 'Apex Trading Solutions', email: 'linda@apextrading.au',
    country: 'AU', flag: '🇦🇺', status: 'Active',
    clientCount: 145, volumeMTD: 2_340,
    commissionMTD: 14_040, commissionTotal: 58_200, commissionRate: 6,
    tier: 'Silver', regDate: '2022-03-15', lastPayout: '2024-01-01', pendingPayout: 2_040,
  },
  {
    id: 'IB003', name: 'ProFX Africa', email: 'tendai@profxafrica.co.za',
    country: 'ZA', flag: '🇿🇦', status: 'Active',
    clientCount: 98, volumeMTD: 1_120,
    commissionMTD: 5_600, commissionTotal: 22_800, commissionRate: 5,
    tier: 'Standard', regDate: '2022-09-01', lastPayout: '2024-01-07', pendingPayout: 600,
  },
  {
    id: 'IB004', name: 'European Markets IB', email: 'dieter@eumarkets.de',
    country: 'DE', flag: '🇩🇪', status: 'Active',
    clientCount: 67, volumeMTD: 880,
    commissionMTD: 6_160, commissionTotal: 28_000, commissionRate: 7,
    tier: 'Silver', regDate: '2023-01-10', lastPayout: '2024-01-01', pendingPayout: 160,
  },
  {
    id: 'IB005', name: 'UK Wealth Connections', email: 'james@ukwealth.co.uk',
    country: 'GB', flag: '🇬🇧', status: 'Pending',
    clientCount: 18, volumeMTD: 240,
    commissionMTD: 1_200, commissionTotal: 1_200, commissionRate: 5,
    tier: 'Standard', regDate: '2024-01-02', lastPayout: 'N/A', pendingPayout: 1_200,
  },
];

// ─── CLIENT GROUPS ────────────────────────────────────────────────────────────

export const MOCK_CLIENT_GROUPS: ClientGroup[] = [
  { id: 'CG001', name: 'VIP', description: 'High-value clients with enhanced service', clientCount: 48, leverage: '1:200', commissionType: 'Spread', swapFree: false, bonusEligible: false, color: '#EAB308' },
  { id: 'CG002', name: 'Professional', description: 'Professional/institutional clients per MiFID II', clientCount: 124, leverage: '1:200', commissionType: 'Per Lot', swapFree: false, bonusEligible: false, color: '#A855F7' },
  { id: 'CG003', name: 'Standard', description: 'Default retail client group', clientCount: 891, leverage: '1:30', commissionType: 'Spread', swapFree: false, bonusEligible: true, color: '#3B82F6' },
  { id: 'CG004', name: 'Swap-Free', description: 'Islamic accounts — no overnight swap', clientCount: 184, leverage: '1:50', commissionType: 'Per Lot', swapFree: true, bonusEligible: true, color: '#10D996' },
];

// ─── INSTRUMENTS ──────────────────────────────────────────────────────────────

export const MOCK_INSTRUMENTS: Instrument[] = [
  { id: 'I001', symbol: 'EUR/USD', name: 'Euro / US Dollar', assetClass: 'Forex', status: 'Active', spread: 0.8, spreadType: 'Variable', minLot: 0.01, maxLot: 100, lotStep: 0.01, leverage: '1:30', swapLong: -3.2, swapShort: 1.1, digits: 5, contractSize: 100_000, openPositions: 142, volumeToday: 4_820 },
  { id: 'I002', symbol: 'GBP/USD', name: 'British Pound / US Dollar', assetClass: 'Forex', status: 'Active', spread: 1.1, spreadType: 'Variable', minLot: 0.01, maxLot: 100, lotStep: 0.01, leverage: '1:30', swapLong: -4.1, swapShort: 1.8, digits: 5, contractSize: 100_000, openPositions: 88, volumeToday: 2_340 },
  { id: 'I003', symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', assetClass: 'Forex', status: 'Active', spread: 0.9, spreadType: 'Variable', minLot: 0.01, maxLot: 100, lotStep: 0.01, leverage: '1:30', swapLong: 2.4, swapShort: -5.2, digits: 3, contractSize: 100_000, openPositions: 118, volumeToday: 3_210 },
  { id: 'I004', symbol: 'AUD/USD', name: 'Australian Dollar / US Dollar', assetClass: 'Forex', status: 'Active', spread: 1.0, spreadType: 'Variable', minLot: 0.01, maxLot: 100, lotStep: 0.01, leverage: '1:30', swapLong: -2.1, swapShort: 0.8, digits: 5, contractSize: 100_000, openPositions: 62, volumeToday: 1_120 },
  { id: 'I005', symbol: 'XAUUSD', name: 'Gold / US Dollar', assetClass: 'Commodities', status: 'Active', spread: 0.3, spreadType: 'Variable', minLot: 0.01, maxLot: 10, lotStep: 0.01, leverage: '1:20', swapLong: -12.0, swapShort: 5.5, digits: 2, contractSize: 100, openPositions: 74, volumeToday: 1_840 },
  { id: 'I006', symbol: 'US30', name: 'Dow Jones 30', assetClass: 'Indices', status: 'Active', spread: 2.5, spreadType: 'Variable', minLot: 0.1, maxLot: 20, lotStep: 0.1, leverage: '1:20', swapLong: -8.5, swapShort: 2.2, digits: 1, contractSize: 1, openPositions: 31, volumeToday: 680 },
  { id: 'I007', symbol: 'GER40', name: 'DAX 40', assetClass: 'Indices', status: 'Active', spread: 2.0, spreadType: 'Variable', minLot: 0.1, maxLot: 20, lotStep: 0.1, leverage: '1:20', swapLong: -7.2, swapShort: 1.8, digits: 1, contractSize: 1, openPositions: 24, volumeToday: 520 },
  { id: 'I008', symbol: 'BTC/USD', name: 'Bitcoin / US Dollar', assetClass: 'Crypto', status: 'Active', spread: 45, spreadType: 'Variable', minLot: 0.01, maxLot: 2, lotStep: 0.01, leverage: '1:2', swapLong: -25.0, swapShort: -20.0, digits: 2, contractSize: 1, openPositions: 18, volumeToday: 340 },
  { id: 'I009', symbol: 'ETH/USD', name: 'Ethereum / US Dollar', assetClass: 'Crypto', status: 'Active', spread: 3.5, spreadType: 'Variable', minLot: 0.01, maxLot: 10, lotStep: 0.01, leverage: '1:2', swapLong: -18.0, swapShort: -14.0, digits: 2, contractSize: 1, openPositions: 12, volumeToday: 220 },
  { id: 'I010', symbol: 'XTIUSD', name: 'Crude Oil WTI', assetClass: 'Commodities', status: 'Active', spread: 0.04, spreadType: 'Variable', minLot: 0.1, maxLot: 10, lotStep: 0.1, leverage: '1:10', swapLong: -5.5, swapShort: 2.0, digits: 3, contractSize: 1_000, openPositions: 28, volumeToday: 560 },
];

// ─── ORDERS ───────────────────────────────────────────────────────────────────

export const MOCK_ORDERS: Order[] = [
  { id: 'ORD001', clientId: 'C1009', clientName: 'Tariq Hassan', symbol: 'EUR/USD', type: 'Market', side: 'Buy', status: 'Open', lots: 5.00, openPrice: 1.09210, currentPrice: 1.09134, commission: -25.00, swap: -3.20, floatPnl: -380.00, openTime: '2024-01-15 06:30' },
  { id: 'ORD002', clientId: 'C1001', clientName: 'Alexander Mitchell', symbol: 'XAUUSD', type: 'Market', side: 'Buy', status: 'Open', lots: 2.00, openPrice: 2018.50, currentPrice: 2024.80, commission: -7.00, swap: -12.00, floatPnl: 1_260.00, openTime: '2024-01-14 14:22' },
  { id: 'ORD003', clientId: 'C1005', clientName: 'Wei Zhang', symbol: 'GBP/USD', type: 'Market', side: 'Sell', status: 'Open', lots: 3.00, openPrice: 1.27450, currentPrice: 1.27320, commission: -18.00, swap: 1.80, floatPnl: 390.00, openTime: '2024-01-15 08:00' },
  { id: 'ORD004', clientId: 'C1007', clientName: 'Priya Sharma', symbol: 'USD/JPY', type: 'Market', side: 'Sell', status: 'Open', lots: 1.50, openPrice: 146.820, currentPrice: 147.120, commission: -7.50, swap: -5.20, floatPnl: -306.00, openTime: '2024-01-15 07:15' },
  { id: 'ORD005', clientId: 'C1015', clientName: 'Omar Abdullah', symbol: 'US30', type: 'Market', side: 'Buy', status: 'Open', lots: 2.00, openPrice: 37_420, currentPrice: 37_380, commission: 0, swap: -8.50, floatPnl: -80.00, openTime: '2024-01-15 03:00' },
  { id: 'ORD006', clientId: 'C1011', clientName: 'David Thompson', symbol: 'AUD/USD', type: 'Limit', side: 'Buy', status: 'Pending', lots: 4.00, openPrice: 0.65500, commission: 0, swap: 0, openTime: '2024-01-15 09:00' },
  { id: 'ORD007', clientId: 'C1002', clientName: 'Fatima Al-Rashidi', symbol: 'GER40', type: 'Market', side: 'Sell', status: 'Open', lots: 1.00, openPrice: 16_842, currentPrice: 16_820, commission: 0, swap: -7.20, floatPnl: 22.00, openTime: '2024-01-15 10:02' },
  { id: 'ORD008', clientId: 'C1018', clientName: 'Yuki Tanaka', symbol: 'EUR/USD', type: 'Market', side: 'Buy', status: 'Open', lots: 2.00, openPrice: 1.09080, currentPrice: 1.09134, commission: -10.00, swap: -3.20, floatPnl: 108.00, openTime: '2024-01-14 22:10' },
  { id: 'ORD009', clientId: 'C1001', clientName: 'Alexander Mitchell', symbol: 'GBP/USD', type: 'Market', side: 'Buy', status: 'Filled', lots: 1.00, openPrice: 1.26800, closePrice: 1.27120, commission: -6.00, swap: 0, realizedPnl: 320.00, openTime: '2024-01-13 10:00', closeTime: '2024-01-14 16:30' },
  { id: 'ORD010', clientId: 'C1003', clientName: 'James Okafor', symbol: 'XAUUSD', type: 'Market', side: 'Sell', status: 'Open', lots: 0.50, openPrice: 2025.10, currentPrice: 2024.80, commission: -1.75, swap: 5.50, floatPnl: 15.00, openTime: '2024-01-15 11:00' },
];

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────

export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: 'T10001', clientId: 'C1001', clientName: 'Alexander Mitchell', type: 'Withdrawal', status: 'Pending', amount: 25_000, currency: 'USD', method: 'Wire Transfer', reference: 'WD-2024-001', createdAt: '2024-01-15 08:30', flagged: false },
  { id: 'T10002', clientId: 'C1005', clientName: 'Wei Zhang', type: 'Withdrawal', status: 'Pending', amount: 15_000, currency: 'USD', method: 'Wire Transfer', reference: 'WD-2024-002', createdAt: '2024-01-15 07:45', flagged: false },
  { id: 'T10003', clientId: 'C1002', clientName: 'Fatima Al-Rashidi', type: 'Deposit', status: 'Pending', amount: 5_000, currency: 'USD', method: 'VISA', reference: 'DEP-2024-003', createdAt: '2024-01-15 09:10', flagged: false },
  { id: 'T10005', clientId: 'C1009', clientName: 'Tariq Hassan', type: 'Withdrawal', status: 'Pending', amount: 18_000, currency: 'USD', method: 'Wire Transfer', reference: 'WD-2024-005', createdAt: '2024-01-14 23:55', notes: 'AML flagged — enhanced review required', flagged: true },
  { id: 'T10007', clientId: 'C1011', clientName: 'David Thompson', type: 'Withdrawal', status: 'Pending', amount: 12_000, currency: 'USD', method: 'Wire Transfer', reference: 'WD-2024-007', createdAt: '2024-01-14 18:30', flagged: false },
  { id: 'T10013', clientId: 'C1001', clientName: 'Alexander Mitchell', type: 'Deposit', status: 'Completed', amount: 20_000, currency: 'USD', method: 'Wire Transfer', reference: 'DEP-2024-013', createdAt: '2024-01-14 09:00', processedAt: '2024-01-14 10:22', flagged: false },
  { id: 'T10015', clientId: 'C1009', clientName: 'Tariq Hassan', type: 'Deposit', status: 'Completed', amount: 30_000, currency: 'USD', method: 'Wire Transfer', reference: 'DEP-2024-015', createdAt: '2024-01-12 08:00', processedAt: '2024-01-12 14:00', notes: 'Enhanced due diligence completed', flagged: false },
  { id: 'T10016', clientId: 'C1012', clientName: 'Elena Petrov', type: 'Withdrawal', status: 'Rejected', amount: 800, currency: 'USD', method: 'VISA', reference: 'WD-2024-016', createdAt: '2023-11-28 14:00', notes: 'KYC rejected — document forgery suspected', flagged: true },
  { id: 'T10020', clientId: 'C1002', clientName: 'Fatima Al-Rashidi', type: 'Bonus', status: 'Completed', amount: 500, currency: 'USD', method: 'System', reference: 'BON-2024-020', createdAt: '2024-01-08 09:00', notes: 'Deposit match bonus 10%', flagged: false },
  { id: 'T10021', clientId: 'C1004', clientName: 'Sophie Bergmann', type: 'Deposit', status: 'Processing', amount: 1_500, currency: 'USD', method: 'SEPA', reference: 'DEP-2024-021', createdAt: '2024-01-15 08:00', flagged: false },
];

// ─── SURVEILLANCE ALERTS ──────────────────────────────────────────────────────

export const MOCK_SURVEILLANCE: SurveillanceAlert[] = [
  { id: 'SA001', clientId: 'C1009', clientName: 'Tariq Hassan', pattern: 'Layering', severity: 'Critical', status: 'Open', description: 'Unusual deposit/withdrawal pattern detected. 5 deposits in 48h totaling $48K.', detectedAt: '2024-01-15 08:45', trades: ['ORD001', 'ORD005'], assignedTo: 'Sarah Chen' },
  { id: 'SA002', clientId: 'C1001', clientName: 'Alexander Mitchell', pattern: 'Price Manipulation', severity: 'High', status: 'Open', description: '$25,000 withdrawal request. First withdrawal >$10K from this account.', detectedAt: '2024-01-15 08:30', trades: ['ORD002'], assignedTo: 'Mike Ross' },
  { id: 'SA003', clientId: 'C1015', clientName: 'Omar Abdullah', pattern: 'Churning', severity: 'Medium', status: 'Under Review', description: 'Margin level at 31.7%. Stop-out level is 20%.', detectedAt: '2024-01-15 07:22', trades: ['ORD005'] },
  { id: 'SA004', clientId: 'C1009', clientName: 'Tariq Hassan', pattern: 'Spoofing', severity: 'Medium', status: 'Open', description: '47 trades executed in under 2 minutes. Possible automated trading.', detectedAt: '2024-01-14 22:00', trades: ['ORD001'] },
  { id: 'SA005', clientId: 'C1012', clientName: 'Elena Petrov', pattern: 'Wash Trading', severity: 'High', status: 'Resolved', description: 'Suspected document forgery. Account suspended.', detectedAt: '2023-12-01 08:15', trades: [], resolution: 'Account suspended. KYC re-submission required.' },
];

// ─── EXPOSURE LIMITS ──────────────────────────────────────────────────────────

export const MOCK_EXPOSURE_LIMITS: ExposureLimit[] = [
  { id: 'EL001', symbol: 'EUR/USD', maxNetExposure: 5_000_000, currentNetExposure: 3_240_000, utilizationPct: 64.8, alertThreshold: 80, hardLimit: 100, status: 'Normal' },
  { id: 'EL002', symbol: 'GBP/USD', maxNetExposure: 2_000_000, currentNetExposure: 1_720_000, utilizationPct: 86.0, alertThreshold: 80, hardLimit: 100, status: 'Warning' },
  { id: 'EL003', symbol: 'XAUUSD', maxNetExposure: 500_000, currentNetExposure: 184_000, utilizationPct: 36.8, alertThreshold: 75, hardLimit: 100, status: 'Normal' },
  { id: 'EL004', symbol: 'US30', maxNetExposure: 1_000_000, currentNetExposure: 820_000, utilizationPct: 82.0, alertThreshold: 80, hardLimit: 100, status: 'Warning' },
  { id: 'EL005', symbol: 'BTC/USD', maxNetExposure: 200_000, currentNetExposure: 48_000, utilizationPct: 24.0, alertThreshold: 70, hardLimit: 100, status: 'Normal' },
  { id: 'EL006', symbol: 'USD/JPY', maxNetExposure: 3_000_000, currentNetExposure: 2_880_000, utilizationPct: 96.0, alertThreshold: 80, hardLimit: 100, status: 'Breach' },
];

// ─── RISK METRICS ─────────────────────────────────────────────────────────────

export const MOCK_RISK_METRICS: RiskMetric[] = [
  { symbol: 'EUR/USD', netExposure: 3_240_000, grossExposure: 5_800_000, longExposure: 4_520_000, shortExposure: 1_280_000, clientCount: 142, maxDrawdown: 2.4, hedgeRatio: 0.28, bookType: 'Hybrid' },
  { symbol: 'GBP/USD', netExposure: 1_720_000, grossExposure: 2_840_000, longExposure: 2_280_000, shortExposure: 560_000, clientCount: 88, maxDrawdown: 3.1, hedgeRatio: 0.20, bookType: 'B-Book' },
  { symbol: 'USD/JPY', netExposure: 2_880_000, grossExposure: 4_200_000, longExposure: 3_540_000, shortExposure: 660_000, clientCount: 118, maxDrawdown: 1.8, hedgeRatio: 0.16, bookType: 'Hybrid' },
  { symbol: 'XAUUSD', netExposure: 184_000, grossExposure: 620_000, longExposure: 402_000, shortExposure: 218_000, clientCount: 74, maxDrawdown: 4.2, hedgeRatio: 0.35, bookType: 'A-Book' },
  { symbol: 'US30', netExposure: 820_000, grossExposure: 1_100_000, longExposure: 960_000, shortExposure: 140_000, clientCount: 31, maxDrawdown: 5.8, hedgeRatio: 0.13, bookType: 'B-Book' },
  { symbol: 'BTC/USD', netExposure: 48_000, grossExposure: 180_000, longExposure: 114_000, shortExposure: 66_000, clientCount: 18, maxDrawdown: 12.4, hedgeRatio: 0.37, bookType: 'A-Book' },
];

// ─── REVENUE DATA (30 days) ────────────────────────────────────────────────────

export const MOCK_REVENUE_DATA: RevenuePoint[] = (() => {
  const data: RevenuePoint[] = [];
  const base = new Date('2023-12-17');
  for (let i = 0; i < 30; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const multiplier = isWeekend ? 0.3 : 1;
    const spread = Math.round((8_000 + Math.random() * 4_000) * multiplier);
    const commission = Math.round((3_200 + Math.random() * 1_800) * multiplier);
    const swap = Math.round((600 + Math.random() * 400) * multiplier);
    const bonusCost = Math.round((400 + Math.random() * 200) * multiplier);
    data.push({
      label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      spread, commission, swap, bonusCost,
      total: spread + commission + swap - bonusCost,
    });
  }
  return data;
})();

// ─── ACTIVITY FEED ────────────────────────────────────────────────────────────

export const MOCK_ACTIVITY_FEED: ActivityEvent[] = [
  { id: 'AF001', type: 'alert', message: 'Surveillance alert: Tariq Hassan — layering pattern detected', time: '08:45' },
  { id: 'AF002', type: 'withdrawal', message: 'Withdrawal request: Alexander Mitchell — $25,000 pending approval', clientName: 'Alexander Mitchell', amount: 25_000, time: '08:30' },
  { id: 'AF003', type: 'deposit', message: 'Deposit confirmed: Wei Zhang — $7,500 via VISA', clientName: 'Wei Zhang', amount: 7_500, time: '08:12' },
  { id: 'AF004', type: 'kyc', message: 'KYC submitted: Sophie Bergmann — Passport + Utility Bill', clientName: 'Sophie Bergmann', time: '08:00' },
  { id: 'AF005', type: 'trade', message: 'Large position opened: Tariq Hassan — 5 lots EUR/USD Buy', clientName: 'Tariq Hassan', symbol: 'EUR/USD', time: '07:55' },
  { id: 'AF006', type: 'deposit', message: 'Deposit confirmed: Fatima Al-Rashidi — $5,000 via VISA', clientName: 'Fatima Al-Rashidi', amount: 5_000, time: '07:40' },
  { id: 'AF007', type: 'registration', message: 'New registration: Isabella Romano — Italy', clientName: 'Isabella Romano', time: '07:22' },
  { id: 'AF008', type: 'login', message: 'Admin login: Sarah Chen — 2FA verified', time: '07:14' },
  { id: 'AF009', type: 'trade', message: 'Position closed: Alexander Mitchell — GBP/USD +$320 profit', clientName: 'Alexander Mitchell', symbol: 'GBP/USD', time: '06:30' },
  { id: 'AF010', type: 'alert', message: 'Margin warning: Omar Abdullah — margin level 31.7%', time: '06:22' },
  { id: 'AF011', type: 'withdrawal', message: 'Withdrawal approved: Priya Sharma — $8,000', clientName: 'Priya Sharma', amount: 8_000, time: '05:45' },
  { id: 'AF012', type: 'kyc', message: 'KYC approved: Carlos Mendez — Enhanced verification', clientName: 'Carlos Mendez', time: '04:30' },
];

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

export const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 'N001', type: 'critical', title: 'AML Alert — Tariq Hassan', body: 'Unusual deposit pattern flagged. Account requires immediate review.', time: '08:45', read: false, moduleId: 'risk-dashboard' },
  { id: 'N002', type: 'warning', title: '14 KYC Documents Pending', body: 'Compliance queue is growing. Oldest submission is 2 days old.', time: '08:00', read: false, moduleId: 'kyc-queue' },
  { id: 'N003', type: 'warning', title: 'Exposure Breach — USD/JPY', body: 'USD/JPY net exposure at 96% of hard limit. Review required.', time: '07:55', read: false, moduleId: 'risk-dashboard' },
  { id: 'N004', type: 'info', title: 'Withdrawal Queue — 23 Pending', body: 'Largest pending: $25,000 — Alexander Mitchell (Wire Transfer)', time: '07:30', read: false, moduleId: 'transactions' },
  { id: 'N005', type: 'critical', title: 'Surveillance Alert — Spoofing', body: 'Tariq Hassan: 47 trades in 2 minutes. Escalation recommended.', time: '06:45', read: false, moduleId: 'risk-dashboard' },
  { id: 'N006', type: 'system', title: 'FIX Bridge Latency Spike', body: 'Average execution latency increased to 48ms (normal: 12ms).', time: '05:20', read: true },
  { id: 'N007', type: 'info', title: 'IB Payout Cycle Completed', body: 'January 1st payout: $41,760 disbursed to 3 IBs.', time: 'Yesterday', read: true },
  { id: 'N008', type: 'warning', title: 'KYC Expiry — 8 Clients', body: '8 client KYC documents expiring within 30 days. Renewal reminders sent.', time: 'Yesterday', read: true },
];

// ─── SYSTEM STATUS ────────────────────────────────────────────────────────────

export const MOCK_SYSTEM_STATUS: SystemStatus[] = [
  { service: 'Trading Engine', status: 'operational', latency: 8, uptime: 99.98 },
  { service: 'FIX Bridge', status: 'operational', latency: 48, uptime: 99.92 },
  { service: 'Payment Gateway', status: 'operational', latency: 120, uptime: 99.95 },
  { service: 'KYC Service', status: 'operational', latency: 340, uptime: 99.80 },
  { service: 'Market Data Feed', status: 'operational', latency: 5, uptime: 100 },
  { service: 'Email / SMTP', status: 'degraded', latency: 2_400, uptime: 98.40 },
];

// ─── TEAM MEMBERS ─────────────────────────────────────────────────────────────

export const MOCK_TEAM_MEMBERS: TeamMember[] = [
  { id: 'TM001', name: 'Sarah Chen', email: 'sarah.chen@arcafx.com', role: 'Compliance Officer', status: 'Active', lastLogin: '2024-01-15 08:14', createdAt: '2021-01-15', twoFAEnabled: true, ipRestricted: true, allowedIPs: ['194.168.1.0/24'] },
  { id: 'TM002', name: 'Marcus Webb', email: 'marcus.webb@arcafx.com', role: 'Super Admin', status: 'Active', lastLogin: '2024-01-15 07:52', createdAt: '2020-06-01', twoFAEnabled: true, ipRestricted: true },
  { id: 'TM003', name: 'Jennifer Park', email: 'j.park@arcafx.com', role: 'Admin', status: 'Active', lastLogin: '2024-01-15 08:00', createdAt: '2022-03-10', twoFAEnabled: true, ipRestricted: false },
  { id: 'TM004', name: 'Mike Ross', email: 'm.ross@arcafx.com', role: 'Compliance', status: 'Active', lastLogin: '2024-01-14 17:30', createdAt: '2022-07-22', twoFAEnabled: true, ipRestricted: false },
  { id: 'TM005', name: 'Amanda Foster', email: 'a.foster@arcafx.com', role: 'Finance', status: 'Active', lastLogin: '2024-01-15 09:00', createdAt: '2022-09-05', twoFAEnabled: false, ipRestricted: false },
  { id: 'TM006', name: 'David Kim', email: 'd.kim@arcafx.com', role: 'Support', status: 'Active', lastLogin: '2024-01-15 08:45', createdAt: '2023-01-12', twoFAEnabled: true, ipRestricted: false },
  { id: 'TM007', name: 'Rachel Torres', email: 'r.torres@arcafx.com', role: 'Support', status: 'Active', lastLogin: '2024-01-14 22:00', createdAt: '2023-04-18', twoFAEnabled: false, ipRestricted: false },
  { id: 'TM008', name: 'Alex Novak', email: 'a.novak@arcafx.com', role: 'Dealer', status: 'Active', lastLogin: '2024-01-15 06:30', createdAt: '2023-06-01', twoFAEnabled: true, ipRestricted: true },
];

// ─── BONUSES ──────────────────────────────────────────────────────────────────

export const MOCK_BONUSES: Bonus[] = [
  { id: 'BN001', name: 'Welcome Bonus 100%', type: 'Welcome', status: 'Active', amount: 100, amountType: 'Percentage', minDeposit: 100, maxBonus: 1_000, turnoverMultiple: 30, claimedCount: 312, totalAwarded: 124_800, startDate: '2023-01-01', eligibleGroups: ['Standard'] },
  { id: 'BN002', name: 'Deposit Match 50%', type: 'Deposit', status: 'Active', amount: 50, amountType: 'Percentage', minDeposit: 500, maxBonus: 2_500, turnoverMultiple: 20, claimedCount: 184, totalAwarded: 210_400, startDate: '2023-06-01', eligibleGroups: ['Standard', 'VIP'] },
  { id: 'BN003', name: 'VIP Loyalty Reward', type: 'Loyalty', status: 'Active', amount: 500, amountType: 'Fixed', turnoverMultiple: 10, claimedCount: 48, totalAwarded: 24_000, startDate: '2022-01-01', eligibleGroups: ['VIP'] },
  { id: 'BN004', name: 'January Trading Contest', type: 'Contest', status: 'Active', amount: 5_000, amountType: 'Fixed', turnoverMultiple: 0, claimedCount: 0, totalAwarded: 0, startDate: '2024-01-01', endDate: '2024-01-31', eligibleGroups: ['Standard', 'Professional', 'VIP'] },
  { id: 'BN005', name: 'Referral Reward $50', type: 'Referral', status: 'Active', amount: 50, amountType: 'Fixed', minDeposit: 200, turnoverMultiple: 5, claimedCount: 89, totalAwarded: 4_450, startDate: '2023-03-01', eligibleGroups: ['Standard', 'Professional', 'VIP'] },
];

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────

export const MOCK_AUDIT_LOG: AuditLogEntry[] = [
  { id: 'AL001', actor: 'Sarah Chen', actorRole: 'Compliance Officer', action: 'KYC_APPROVE', module: 'kyc-queue', target: 'Client C1001 — Alexander Mitchell', ip: '194.168.1.42', timestamp: '2024-01-15 08:50', severity: 'Info' },
  { id: 'AL002', actor: 'Mike Ross', actorRole: 'Compliance', action: 'AML_FLAG', module: 'risk-dashboard', target: 'Client C1009 — Tariq Hassan', ip: '194.168.1.55', timestamp: '2024-01-15 08:45', severity: 'Critical', after: { amlStatus: 'Flagged', score: 68 } },
  { id: 'AL003', actor: 'Jennifer Park', actorRole: 'Admin', action: 'TRANSACTION_APPROVE', module: 'transactions', target: 'Transaction T10013 — $20,000 deposit', ip: '194.168.1.31', timestamp: '2024-01-14 10:22', severity: 'Info' },
  { id: 'AL004', actor: 'Sarah Chen', actorRole: 'Compliance Officer', action: 'ACCOUNT_SUSPEND', module: 'clients', target: 'Client C1012 — Elena Petrov', ip: '194.168.1.42', timestamp: '2023-12-01 09:00', severity: 'Warning', after: { status: 'Suspended', reason: 'KYC rejected — document forgery' } },
  { id: 'AL005', actor: 'Marcus Webb', actorRole: 'Super Admin', action: 'ROLE_UPDATE', module: 'team', target: 'Role: Compliance — added APPROVE permission', ip: '194.168.1.10', timestamp: '2024-01-10 14:00', severity: 'Warning' },
  { id: 'AL006', actor: 'Amanda Foster', actorRole: 'Finance', action: 'IB_PAYOUT', module: 'ib-commissions', target: 'IB001 Global FX Partners — $35,000', ip: '194.168.1.28', timestamp: '2024-01-01 10:00', severity: 'Info' },
];
