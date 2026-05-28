/* Seed default Phase 13a withdrawal risk rules. One-shot. */
import { seedDefaultWithdrawalRiskRules } from "@/lib/withdrawal/seed"

async function main() {
  const result = await seedDefaultWithdrawalRiskRules()
  console.log("seed result:", result)
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
