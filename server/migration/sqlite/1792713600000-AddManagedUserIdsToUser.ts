import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddManagedUserIdsToUser1792713600000
  implements MigrationInterface
{
  name = 'AddManagedUserIdsToUser1792713600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "managedUserIds" text`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "managedUserIds"`);
  }
}
