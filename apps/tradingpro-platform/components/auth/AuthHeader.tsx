/**
 * @file AuthHeader.tsx
 * @module components/auth
 * @description Auth card header with responsive brand logo and contextual helper label.
 * @author StockTrade
 * @created 2026-02-16
 */

import { cn } from '@/lib/utils';
import { Poppins } from 'next/font/google'
import Image from 'next/image';
import { BRAND_ASSETS, BRAND_IDENTITY } from "@/Branding";

const font = Poppins({
    subsets: ["latin"],
    weight: ["600"]
})

interface HeaderProps {
    label: string;
}

export const AuthHeader = ({ label }: HeaderProps) => {
    return (
        <div className='w-full flex flex-col gap-y-4 items-center justify-center text-center'>
            <div className={cn(
                "text-3xl font-semibold",
                font.className
            )}>
                <Image 
                src={BRAND_ASSETS.logos.authHeader}
                alt={`${BRAND_IDENTITY.names.full} logo`}
                className='h-auto w-[180px] sm:w-[220px] lg:w-[260px] object-contain' 
                width={500}
                height={200}
                />
            </div>
            <p className='text-muted-foreground text-sm leading-relaxed max-w-sm'>
                {label}
            </p>
        </div>
    )
}