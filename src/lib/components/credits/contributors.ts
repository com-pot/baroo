const avatars = import.meta.glob("./*.jpg", { eager: true, import: 'default' }) as Record<string, string>
type Contact = {
    fullName: string;
    links: ContactLinkEntries[];
};
type ContactLinkEntries = { provider: string; href: string };
type Contributor = {
    contact: Contact;
    avatar: string,
    contributionNote: string;
};
export const contributors: (Contributor & { id: string })[] = [
    {
        id: "toanir",
        avatar: avatars['./toanir.jpg'],
        contact: {
            fullName: "Toanir",
            links: [
                { provider: "homepage", href: "https://toanir.kous.at" },
            ],
        },
        contributionNote: "Baroo lead, UX, 🦎",
    },
    {
        id: "granya",
        avatar: avatars['./granya.jpg'],
        contact: {
            fullName: "Granya",
            links: [
                { provider: "linktree", href: "https://linktr.ee/Granya" },
            ],
        },
        contributionNote: "HW - TapTappers, On-Site OPS",
    },
    {
        id: "nilly",
        avatar: avatars['./nilly.jpg'],
        contact: {
            fullName: "Nill",
            links: [
                { provider: "carrd", href: "https://nilly.carrd.co" },
            ],
        },
        contributionNote: "Baroo Logotype",
    },
];
