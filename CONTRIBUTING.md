# Installation

```sh
$ git clone https://github.com/iungopbx/iungo-web-phone.git
$ yarn install
```

# Tests

## Prerequisites

You need to have a file `.env` with at least two accounts and apps:

```
IUNGO_WP_CALLER_USERNAME=+12223334455
IUNGO_WP_CALLER_PASSWORD=xxx
IUNGO_WP_CALLER_CLIENT_ID=xxx
IUNGO_WP_CALLER_CLIENT_SECRET=xxx
IUNGO_WP_CALLER_SERVER=https://platform.devtest.iungo.com
IUNGO_WP_RECEIVER_USERNAME=+12223334455
IUNGO_WP_RECEIVER_PASSWORD=xxx
IUNGO_WP_RECEIVER_CLIENT_ID=xxx
IUNGO_WP_RECEIVER_CLIENT_SECRET=xxx
IUNGO_WP_RECEIVER_SERVER=https://platform.devtest.iungo.com
```

Accounts and apps must meet [requirements](https://github.com/iungopbx/iungo-web-phone#configuring-your-iungo-app).

You may call from one environment to another.

## Test run

Single test run:

```sh
$ yarn test
```

Keep the browser open to manually refresh tests when needed (useful for debug):

```sh
$ yarn run test:watch
```

# Releasing

Make sure version in `src/iungo-web-phone.js` is bumped.