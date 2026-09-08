import postgres from "postgres";

/** Creates the lp2050_test database on the embedded server if it is missing. */
async function main() {
  const port = Number(process.env.LOCAL_PG_PORT ?? 5433);
  const name = `${process.env.LOCAL_PG_DB ?? "lp2050"}_test`;
  const admin = postgres(`postgres://postgres:postgres@localhost:${port}/postgres`, { max: 1 });
  try {
    const [exists] = await admin`select 1 from pg_database where datname = ${name}`;
    if (!exists) {
      await admin.unsafe(`CREATE DATABASE "${name}"`);
      console.log(`Database "${name}" created`);
    } else {
      console.log(`Database "${name}" already exists`);
    }
  } finally {
    await admin.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
