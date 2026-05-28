"use client"
import React from 'react'
import { Button } from '../ui/button'
import Link from 'next/link'

interface AuthBackButtonProps {
    label: string,
    href: string,
    onClick?: () => void
}

const AuthBackButton = ({ label, href, onClick }: AuthBackButtonProps) => {
    if (onClick) {
        return (
            <Button
                variant="link"
                className='font-normal w-full'
                size="sm"
                onClick={onClick}
            >
                {label}
            </Button>
        )
    }

    return (
        <Button
            variant="link"
            className='font-normal w-full'
            size="sm"
            asChild
        >
            <Link href={href}>{label}</Link>
        </Button>
    )
}

export default AuthBackButton