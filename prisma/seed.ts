import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // 创建默认平台配置（需要用户自行填写 API Key）
  const platforms = ["AWIN", "IMPACT", "LEADDYNO", "GOAFFPRO"];
  for (const platform of platforms) {
    await prisma.platformConfig.upsert({
      where: { platform: platform as any },
      update: {},
      create: {
        platform: platform as any,
        apiKey: "",
        isActive: false,
      },
    });
  }

  console.log("✅ Seed completed. Platform configs created, please fill in your API keys.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
