import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStorageQuotaToUser1793000000000 implements MigrationInterface {
  name = 'AddStorageQuotaToUser1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "storageQuotaGb" integer DEFAULT (200)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "storageQuotaGb"`);
  }
}
