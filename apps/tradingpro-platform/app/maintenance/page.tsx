import { MaintenanceMode } from '@/components/maintenance';

/**
 * Maintenance Page
 * 
 * Dedicated page for maintenance mode display
 * This page is shown when MAINTENANCE_MODE=true
 * 
 * Features:
 * - Enterprise-level design
 * - Real-time countdown timer
 * - Status updates
 * - Admin bypass functionality
 * - Responsive design
 * - Accessibility compliance
 * 
 * @returns JSX.Element - The maintenance page
 */
export default function MaintenancePage() {
  return <MaintenanceMode />;
}

// Force static generation for better performance
export const dynamic = 'force-static';