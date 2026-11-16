# gmail codegen report

Source: Gmail API v1, revision 20261102

- 79 actions, 91 routes (12 upload/resumable variants)

## Actions

- `gmail.users.drafts.create` POST `/gmail/v1/users/{userId}/drafts` +upload +resumable
- `gmail.users.drafts.delete` DELETE `/gmail/v1/users/{userId}/drafts/{id}`
- `gmail.users.drafts.get` GET `/gmail/v1/users/{userId}/drafts/{id}`
- `gmail.users.drafts.list` GET `/gmail/v1/users/{userId}/drafts`
- `gmail.users.drafts.send` POST `/gmail/v1/users/{userId}/drafts/send` +upload +resumable
- `gmail.users.drafts.update` PUT `/gmail/v1/users/{userId}/drafts/{id}` +upload +resumable
- `gmail.users.getProfile` GET `/gmail/v1/users/{userId}/profile`
- `gmail.users.history.list` GET `/gmail/v1/users/{userId}/history`
- `gmail.users.labels.create` POST `/gmail/v1/users/{userId}/labels`
- `gmail.users.labels.delete` DELETE `/gmail/v1/users/{userId}/labels/{id}`
- `gmail.users.labels.get` GET `/gmail/v1/users/{userId}/labels/{id}`
- `gmail.users.labels.list` GET `/gmail/v1/users/{userId}/labels`
- `gmail.users.labels.patch` PATCH `/gmail/v1/users/{userId}/labels/{id}`
- `gmail.users.labels.update` PUT `/gmail/v1/users/{userId}/labels/{id}`
- `gmail.users.messages.attachments.get` GET `/gmail/v1/users/{userId}/messages/{messageId}/attachments/{id}`
- `gmail.users.messages.batchDelete` POST `/gmail/v1/users/{userId}/messages/batchDelete`
- `gmail.users.messages.batchModify` POST `/gmail/v1/users/{userId}/messages/batchModify`
- `gmail.users.messages.delete` DELETE `/gmail/v1/users/{userId}/messages/{id}`
- `gmail.users.messages.get` GET `/gmail/v1/users/{userId}/messages/{id}`
- `gmail.users.messages.import` POST `/gmail/v1/users/{userId}/messages/import` +upload +resumable
- `gmail.users.messages.insert` POST `/gmail/v1/users/{userId}/messages` +upload +resumable
- `gmail.users.messages.list` GET `/gmail/v1/users/{userId}/messages`
- `gmail.users.messages.modify` POST `/gmail/v1/users/{userId}/messages/{id}/modify`
- `gmail.users.messages.send` POST `/gmail/v1/users/{userId}/messages/send` +upload +resumable
- `gmail.users.messages.trash` POST `/gmail/v1/users/{userId}/messages/{id}/trash`
- `gmail.users.messages.untrash` POST `/gmail/v1/users/{userId}/messages/{id}/untrash`
- `gmail.users.settings.cse.identities.create` POST `/gmail/v1/users/{userId}/settings/cse/identities`
- `gmail.users.settings.cse.identities.delete` DELETE `/gmail/v1/users/{userId}/settings/cse/identities/{cseEmailAddress}`
- `gmail.users.settings.cse.identities.get` GET `/gmail/v1/users/{userId}/settings/cse/identities/{cseEmailAddress}`
- `gmail.users.settings.cse.identities.list` GET `/gmail/v1/users/{userId}/settings/cse/identities`
- `gmail.users.settings.cse.identities.patch` PATCH `/gmail/v1/users/{userId}/settings/cse/identities/{emailAddress}`
- `gmail.users.settings.cse.keypairs.create` POST `/gmail/v1/users/{userId}/settings/cse/keypairs`
- `gmail.users.settings.cse.keypairs.disable` POST `/gmail/v1/users/{userId}/settings/cse/keypairs/{keyPairId}:disable`
- `gmail.users.settings.cse.keypairs.enable` POST `/gmail/v1/users/{userId}/settings/cse/keypairs/{keyPairId}:enable`
- `gmail.users.settings.cse.keypairs.get` GET `/gmail/v1/users/{userId}/settings/cse/keypairs/{keyPairId}`
- `gmail.users.settings.cse.keypairs.list` GET `/gmail/v1/users/{userId}/settings/cse/keypairs`
- `gmail.users.settings.cse.keypairs.obliterate` POST `/gmail/v1/users/{userId}/settings/cse/keypairs/{keyPairId}:obliterate`
- `gmail.users.settings.delegates.create` POST `/gmail/v1/users/{userId}/settings/delegates`
- `gmail.users.settings.delegates.delete` DELETE `/gmail/v1/users/{userId}/settings/delegates/{delegateEmail}`
- `gmail.users.settings.delegates.get` GET `/gmail/v1/users/{userId}/settings/delegates/{delegateEmail}`
- `gmail.users.settings.delegates.list` GET `/gmail/v1/users/{userId}/settings/delegates`
- `gmail.users.settings.filters.create` POST `/gmail/v1/users/{userId}/settings/filters`
- `gmail.users.settings.filters.delete` DELETE `/gmail/v1/users/{userId}/settings/filters/{id}`
- `gmail.users.settings.filters.get` GET `/gmail/v1/users/{userId}/settings/filters/{id}`
- `gmail.users.settings.filters.list` GET `/gmail/v1/users/{userId}/settings/filters`
- `gmail.users.settings.forwardingAddresses.create` POST `/gmail/v1/users/{userId}/settings/forwardingAddresses`
- `gmail.users.settings.forwardingAddresses.delete` DELETE `/gmail/v1/users/{userId}/settings/forwardingAddresses/{forwardingEmail}`
- `gmail.users.settings.forwardingAddresses.get` GET `/gmail/v1/users/{userId}/settings/forwardingAddresses/{forwardingEmail}`
- `gmail.users.settings.forwardingAddresses.list` GET `/gmail/v1/users/{userId}/settings/forwardingAddresses`
- `gmail.users.settings.getAutoForwarding` GET `/gmail/v1/users/{userId}/settings/autoForwarding`
- `gmail.users.settings.getImap` GET `/gmail/v1/users/{userId}/settings/imap`
- `gmail.users.settings.getLanguage` GET `/gmail/v1/users/{userId}/settings/language`
- `gmail.users.settings.getPop` GET `/gmail/v1/users/{userId}/settings/pop`
- `gmail.users.settings.getVacation` GET `/gmail/v1/users/{userId}/settings/vacation`
- `gmail.users.settings.sendAs.create` POST `/gmail/v1/users/{userId}/settings/sendAs`
- `gmail.users.settings.sendAs.delete` DELETE `/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}`
- `gmail.users.settings.sendAs.get` GET `/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}`
- `gmail.users.settings.sendAs.list` GET `/gmail/v1/users/{userId}/settings/sendAs`
- `gmail.users.settings.sendAs.patch` PATCH `/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}`
- `gmail.users.settings.sendAs.smimeInfo.delete` DELETE `/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}/smimeInfo/{id}`
- `gmail.users.settings.sendAs.smimeInfo.get` GET `/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}/smimeInfo/{id}`
- `gmail.users.settings.sendAs.smimeInfo.insert` POST `/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}/smimeInfo`
- `gmail.users.settings.sendAs.smimeInfo.list` GET `/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}/smimeInfo`
- `gmail.users.settings.sendAs.smimeInfo.setDefault` POST `/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}/smimeInfo/{id}/setDefault`
- `gmail.users.settings.sendAs.update` PUT `/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}`
- `gmail.users.settings.sendAs.verify` POST `/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}/verify`
- `gmail.users.settings.updateAutoForwarding` PUT `/gmail/v1/users/{userId}/settings/autoForwarding`
- `gmail.users.settings.updateImap` PUT `/gmail/v1/users/{userId}/settings/imap`
- `gmail.users.settings.updateLanguage` PUT `/gmail/v1/users/{userId}/settings/language`
- `gmail.users.settings.updatePop` PUT `/gmail/v1/users/{userId}/settings/pop`
- `gmail.users.settings.updateVacation` PUT `/gmail/v1/users/{userId}/settings/vacation`
- `gmail.users.stop` POST `/gmail/v1/users/{userId}/stop`
- `gmail.users.threads.delete` DELETE `/gmail/v1/users/{userId}/threads/{id}`
- `gmail.users.threads.get` GET `/gmail/v1/users/{userId}/threads/{id}`
- `gmail.users.threads.list` GET `/gmail/v1/users/{userId}/threads`
- `gmail.users.threads.modify` POST `/gmail/v1/users/{userId}/threads/{id}/modify`
- `gmail.users.threads.trash` POST `/gmail/v1/users/{userId}/threads/{id}/trash`
- `gmail.users.threads.untrash` POST `/gmail/v1/users/{userId}/threads/{id}/untrash`
- `gmail.users.watch` POST `/gmail/v1/users/{userId}/watch`

## Alternate routes

Each of these reaches the same action as its standard route. The gateway matches them,
so policy applies, but body decoders only handle the standard variant.

- `gmail.users.drafts.create` upload: POST `/upload/gmail/v1/users/{userId}/drafts`
- `gmail.users.drafts.create` resumable: POST `/resumable/upload/gmail/v1/users/{userId}/drafts`
- `gmail.users.drafts.send` upload: POST `/upload/gmail/v1/users/{userId}/drafts/send`
- `gmail.users.drafts.send` resumable: POST `/resumable/upload/gmail/v1/users/{userId}/drafts/send`
- `gmail.users.drafts.update` upload: PUT `/upload/gmail/v1/users/{userId}/drafts/{id}`
- `gmail.users.drafts.update` resumable: PUT `/resumable/upload/gmail/v1/users/{userId}/drafts/{id}`
- `gmail.users.messages.import` upload: POST `/upload/gmail/v1/users/{userId}/messages/import`
- `gmail.users.messages.import` resumable: POST `/resumable/upload/gmail/v1/users/{userId}/messages/import`
- `gmail.users.messages.insert` upload: POST `/upload/gmail/v1/users/{userId}/messages`
- `gmail.users.messages.insert` resumable: POST `/resumable/upload/gmail/v1/users/{userId}/messages`
- `gmail.users.messages.send` upload: POST `/upload/gmail/v1/users/{userId}/messages/send`
- `gmail.users.messages.send` resumable: POST `/resumable/upload/gmail/v1/users/{userId}/messages/send`
