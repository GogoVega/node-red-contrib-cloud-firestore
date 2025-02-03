# Change log

## 0.1.1

### Changes

- Bump `@gogovega/firebase-config-node` from 0.2.0 to 0.2.1
  - Do not call signout if app initialization failed ([#15](https://github.com/GogoVega/Firebase-Config-Node/pull/15))
  - Fix bad Query object returned by applyQueryConstraints ([#16](https://github.com/GogoVega/Firebase-Config-Node/pull/16))

## 0.1.0

### Breaking Changes

- Set required version of Node.js to >=18

### Changes

- Bump `@gogovega/firebase-config-node` from 0.1.3 to 0.2.0
  - Only don't wait signout for Firestore and add a safety delay ([#12](https://github.com/GogoVega/Firebase-Config-Node/pull/12))
  - Set required version of Node.js to >=18
  - Set required version of Node-RED to >=3

## 0.0.3

### Changes

- Improve Config Node version checking (#4)
- Bump `@gogovega/firebase-config-node` from 0.1.2 to 0.1.3

## 0.0.2

### Changes

- Skip database initialization if Config Node version is not satisfied (#3)
- Bump `@gogovega/firebase-config-node` from 0.1.0 to 0.1.2

### Improvements

- Allow multiple use of orderBy and where Query Constraints (#2)

## 0.0.1

Initial version
