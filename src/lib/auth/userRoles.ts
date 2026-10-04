export const userRolesList = [
    'bar-manager'
] as const

const userRoles = Object.fromEntries(userRolesList.map((role) => [role, role] as const)) as {
    [k in typeof userRolesList[number]]: k
}

export default userRoles
