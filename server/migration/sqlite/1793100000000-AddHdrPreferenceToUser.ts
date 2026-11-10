import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHdrPreferenceToUser1793100000000 implements MigrationInterface {
  name = 'AddHdrPreferenceToUser1793100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "hdrPreference" varchar`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "hdrPreference"`);
  }
}
