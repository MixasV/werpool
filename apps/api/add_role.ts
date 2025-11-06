import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const address = '0x3ea7ac2bcdd8bcef';
  
  // Create user
  const user = await prisma.flowUser.upsert({
    where: { address },
    update: { lastSeenAt: new Date() },
    create: {
      address,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      label: 'Main Admin',
    },
  });
  
  console.log('User created:', user);
  
  // Add ADMIN role
  const adminRole = await prisma.roleAssignment.upsert({
    where: {
      address_role: { address, role: 'ADMIN' },
    },
    update: {},
    create: {
      address,
      role: 'ADMIN',
    },
  });
  
  console.log('ADMIN role assigned:', adminRole);
  
  // Add OPERATOR role  
  const operatorRole = await prisma.roleAssignment.upsert({
    where: {
      address_role: { address, role: 'OPERATOR' },
    },
    update: {},
    create: {
      address,
      role: 'OPERATOR',
    },
  });
  
  console.log('OPERATOR role assigned:', operatorRole);
  
  // Show all roles
  const allRoles = await prisma.roleAssignment.findMany({
    where: { address },
  });
  
  console.log('\nAll roles for', address, ':', allRoles);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
