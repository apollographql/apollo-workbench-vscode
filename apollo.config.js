module.exports = {
  client: {
    name: 'Apollo Studio',
    includes: ['./src/graphql/graphClient.ts'],
    service: {
      url: 'https://graphql.api.apollographql.com/api/graphql',
    },
  },
};
