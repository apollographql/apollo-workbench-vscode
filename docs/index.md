---
title: Apollo Workbench Documentation
---

Apollo Workbench is a VS Code extension that is meant to extend the functionality of the GraphOS CLI `rover`. This extension requires that `rover` is installed. There are [simple installation instructions](https://www.apollographql.com/docs/rover/getting-started) for various platforms to install `rover`.

## Disclaimer

This project is currently maintained by Michael Watson because I use it in my free time. I was blocked on taking Workbench any further because of supporting Apollo Federation v1 and v2 became impossible due to v2 starting to require a newer verison of GraphQL. It became impossible to have the necessary federation packages installed from NPM due to this. 

I started on v3 efforts after a couple large rocks were completed. My goal was to utilize `rover` to replace the internals of Workbench. I've completed most of this work and I'm publishing a new version of Workbench for those that missed it. I'll be using it still and fixing things as I can, but I would welcome any help!