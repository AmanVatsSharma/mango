const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function seedRiskConfig() {
  console.log('Seeding risk_config table...')
  
  try {
    // Insert NSE MIS config
    await prisma.riskConfig.upsert({
      where: {
        segment_productType: {
          segment: 'NSE',
          productType: 'MIS'
        }
      },
      update: {},
      create: {
        segment: 'NSE',
        productType: 'MIS',
        leverage: 200,
        brokerageFlat: null,
        brokerageRate: 0.0003,
        brokerageCap: 20,
        active: true
      }
    })

    // Insert NSE CNC config  
    await prisma.riskConfig.upsert({
      where: {
        segment_productType: {
          segment: 'NSE',
          productType: 'CNC'
        }
      },
      update: {},
      create: {
        segment: 'NSE',
        productType: 'CNC',
        leverage: 50,
        brokerageFlat: null,
        brokerageRate: 0.0003,
        brokerageCap: 20,
        active: true
      }
    })

    // Insert NSE DELIVERY config (alias for CNC)
    await prisma.riskConfig.upsert({
      where: {
        segment_productType: {
          segment: 'NSE',
          productType: 'DELIVERY'
        }
      },
      update: {},
      create: {
        segment: 'NSE',
        productType: 'DELIVERY',
        leverage: 50,
        brokerageFlat: null,
        brokerageRate: 0.0003,
        brokerageCap: 20,
        active: true
      }
    })

    // Insert NFO DELIVERY config
    await prisma.riskConfig.upsert({
      where: {
        segment_productType: {
          segment: 'NFO',
          productType: 'DELIVERY'
        }
      },
      update: {},
      create: {
        segment: 'NFO',
        productType: 'DELIVERY',
        leverage: 100,
        brokerageFlat: 20,
        brokerageRate: null,
        brokerageCap: null,
        active: true
      }
    })

    // Insert MCX DELIVERY config
    await prisma.riskConfig.upsert({
      where: {
        segment_productType: {
          segment: 'MCX',
          productType: 'DELIVERY'
        }
      },
      update: {},
      create: {
        segment: 'MCX',
        productType: 'DELIVERY',
        leverage: 50,
        brokerageFlat: 20,
        brokerageRate: null,
        brokerageCap: null,
        active: true
      }
    })

    // Insert NSE_FO DELIVERY config (alias for NFO)
    await prisma.riskConfig.upsert({
      where: {
        segment_productType: {
          segment: 'NSE_FO',
          productType: 'DELIVERY'
        }
      },
      update: {},
      create: {
        segment: 'NSE_FO',
        productType: 'DELIVERY',
        leverage: 100,
        brokerageFlat: 20,
        brokerageRate: null,
        brokerageCap: null,
        active: true
      }
    })

    // Insert MCX_FO DELIVERY config (alias for MCX derivatives)
    await prisma.riskConfig.upsert({
      where: {
        segment_productType: {
          segment: 'MCX_FO',
          productType: 'DELIVERY'
        }
      },
      update: {},
      create: {
        segment: 'MCX_FO',
        productType: 'DELIVERY',
        leverage: 50,
        brokerageFlat: 20,
        brokerageRate: null,
        brokerageCap: null,
        active: true
      }
    })

    console.log('✅ Risk config seeded successfully!')
    
    // Verify the data
    const configs = await prisma.riskConfig.findMany()
    console.log('Current risk configs:', configs)
    
  } catch (error) {
    console.error('❌ Error seeding risk config:', error)
  } finally {
    await prisma.$disconnect()
  }
}

seedRiskConfig()
