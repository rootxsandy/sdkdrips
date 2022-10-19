import type { Network } from '@ethersproject/networks';
import { JsonRpcProvider, JsonRpcSigner } from '@ethersproject/providers';
import type { StubbedInstance } from 'ts-sinon';
import sinon, { stubInterface, stubObject } from 'ts-sinon';
import type { BigNumberish, BytesLike, ContractReceipt, ContractTransaction, Event } from 'ethers';
import { Wallet } from 'ethers';
import { assert } from 'chai';
import type { NFTDriver } from '../../contracts';
import { NFTDriver__factory } from '../../contracts';
import DripsHubClient from '../../src/DripsHub/DripsHubClient';
import NFTDriverClient from '../../src/NFTDriver/NFTDriverClient';
import Utils from '../../src/utils';
import { DripsErrorCode } from '../../src/common/DripsError';
import * as internals from '../../src/common/internals';
import type { DripsReceiverStruct, SplitsReceiverStruct } from '../../contracts/NFTDriver';
import type { DripsReceiver } from '../../src/common/types';

describe('NFTDriverClient', () => {
	const TEST_CHAIN_ID = 5; // Goerli.

	let networkStub: StubbedInstance<Network>;
	let signerStub: StubbedInstance<JsonRpcSigner>;
	let providerStub: StubbedInstance<JsonRpcProvider>;
	let dripsHubClientStub: StubbedInstance<DripsHubClient>;
	let nftDriverContractStub: StubbedInstance<NFTDriver>;

	let testNftDriverClient: NFTDriverClient;

	// Acts also as the "base Arrange step".
	beforeEach(async () => {
		providerStub = sinon.createStubInstance(JsonRpcProvider);

		signerStub = sinon.createStubInstance(JsonRpcSigner);
		signerStub.getAddress.resolves(Wallet.createRandom().address);

		networkStub = stubObject<Network>({ chainId: TEST_CHAIN_ID } as Network);

		providerStub.getSigner.returns(signerStub);
		providerStub.getNetwork.resolves(networkStub);

		nftDriverContractStub = stubInterface<NFTDriver>();
		sinon
			.stub(NFTDriver__factory, 'connect')
			.withArgs(Utils.Network.dripsMetadata[TEST_CHAIN_ID].CONTRACT_NFT_DRIVER, signerStub)
			.returns(nftDriverContractStub);

		dripsHubClientStub = stubInterface<DripsHubClient>();
		sinon.stub(DripsHubClient, 'create').resolves(dripsHubClientStub);

		testNftDriverClient = await NFTDriverClient.create(providerStub);
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('create()', () => {
		it('should throw argumentMissingError error when the provider is missing', async () => {
			// Arrange
			let threw = false;

			try {
				// Act
				await NFTDriverClient.create(undefined as unknown as JsonRpcProvider);
			} catch (error: any) {
				// Assert
				assert.equal(error.code, DripsErrorCode.MISSING_ARGUMENT);
				threw = true;
			}

			// Assert
			assert.isTrue(threw, 'Expected type of exception was not thrown');
		});

		it("should throw argumentMissingError error when the provider's signer is missing", async () => {
			// Arrange
			let threw = false;
			providerStub.getSigner.returns(undefined as unknown as JsonRpcSigner);

			try {
				// Act
				await NFTDriverClient.create(providerStub);
			} catch (error: any) {
				// Assert
				assert.equal(error.code, DripsErrorCode.INVALID_ARGUMENT);
				threw = true;
			}

			// Assert
			assert.isTrue(threw, 'Expected type of exception was not thrown');
		});

		it("should validate the provider's signer address", async () => {
			// Arrange
			const validateAddressStub = sinon.stub(internals, 'validateAddress');

			// Act
			NFTDriverClient.create(providerStub);

			// Assert
			assert(
				validateAddressStub.calledOnceWithExactly(await signerStub.getAddress()),
				'Expected method to be called with different arguments'
			);
		});

		it('should throw unsupportedNetworkError error when the provider is connected to an unsupported network', async () => {
			// Arrange
			let threw = false;
			providerStub.getNetwork.resolves({ chainId: TEST_CHAIN_ID + 1 } as Network);

			try {
				// Act
				await NFTDriverClient.create(providerStub);
			} catch (error: any) {
				// Assert
				assert.equal(error.code, DripsErrorCode.UNSUPPORTED_NETWORK);
				threw = true;
			}

			// Assert
			assert.isTrue(threw, 'Expected type of exception was not thrown');
		});

		it('should create a fully initialized client instance', async () => {
			// Assert
			assert.equal(await testNftDriverClient.signer.getAddress(), await signerStub.getAddress());
			assert.equal(testNftDriverClient.network.chainId, networkStub.chainId);
			assert.equal(
				await testNftDriverClient.provider.getSigner().getAddress(),
				await providerStub.getSigner().getAddress()
			);
			assert.equal(
				testNftDriverClient.dripsMetadata,
				Utils.Network.dripsMetadata[(await providerStub.getNetwork()).chainId]
			);
			assert.equal(testNftDriverClient.signerAddress, await signerStub.getAddress());
			assert.equal(testNftDriverClient.dripsHub.network.chainId, dripsHubClientStub.network.chainId);
		});
	});

	describe('mint()', () => {
		it('should throw argumentMissingError when transferToAddress is missing', async () => {
			// Arrange
			let threw = false;

			try {
				// Act
				await testNftDriverClient.mint(undefined as unknown as string);
			} catch (error: any) {
				// Assert
				assert.equal(error.code, DripsErrorCode.MISSING_ARGUMENT);
				threw = true;
			}

			// Assert
			assert.isTrue(threw, 'Expected type of exception was not thrown');
		});

		it('should validate the ERC20 address', async () => {
			// Arrange
			const transferToAddress = Wallet.createRandom().address;
			const validateAddressStub = sinon.stub(internals, 'validateAddress');

			const waitFake = async () =>
				Promise.resolve({
					events: [{ args: { tokenId: 1 } } as unknown as Event]
				} as unknown as ContractReceipt);
			const txResponse = { wait: waitFake } as ContractTransaction;
			nftDriverContractStub.mint.withArgs(transferToAddress).resolves(txResponse);

			// Act
			await testNftDriverClient.mint(transferToAddress);

			// Assert
			assert(validateAddressStub.calledOnceWithExactly(transferToAddress));
		});

		it('should return the expected token', async () => {
			// Arrange
			const expectedTokenId = 1n;
			const transferToAddress = Wallet.createRandom().address;

			const waitFake = async () =>
				Promise.resolve({
					events: [{ args: { tokenId: expectedTokenId } } as unknown as Event]
				} as unknown as ContractReceipt);
			const txResponse = { wait: waitFake } as ContractTransaction;
			nftDriverContractStub.mint.withArgs(transferToAddress).resolves(txResponse);

			// Act
			const actualTokenId = await testNftDriverClient.mint(transferToAddress);

			// Assert
			assert.equal(actualTokenId, expectedTokenId);
			assert(
				nftDriverContractStub.mint.calledOnceWithExactly(transferToAddress),
				'Expected method to be called with different arguments'
			);
		});
	});

	describe('safeMint()', () => {
		it('should throw argumentMissingError when transferToAddress is missing', async () => {
			// Arrange
			let threw = false;

			try {
				// Act
				await testNftDriverClient.safeMint(undefined as unknown as string);
			} catch (error: any) {
				// Assert
				assert.equal(error.code, DripsErrorCode.MISSING_ARGUMENT);
				threw = true;
			}

			// Assert
			assert.isTrue(threw, 'Expected type of exception was not thrown');
		});

		it('should validate the ERC20 address', async () => {
			// Arrange
			const transferToAddress = Wallet.createRandom().address;
			const validateAddressStub = sinon.stub(internals, 'validateAddress');

			const waitFake = async () =>
				Promise.resolve({
					events: [{ args: { tokenId: 1 } } as unknown as Event]
				} as unknown as ContractReceipt);
			const txResponse = { wait: waitFake } as ContractTransaction;
			nftDriverContractStub.safeMint.withArgs(transferToAddress).resolves(txResponse);

			// Act
			await testNftDriverClient.safeMint(transferToAddress);

			// Assert
			assert(validateAddressStub.calledOnceWithExactly(transferToAddress));
		});

		it('should return the expected token', async () => {
			// Arrange
			const expectedTokenId = 1n;
			const transferToAddress = Wallet.createRandom().address;

			const waitFake = async () =>
				Promise.resolve({
					events: [{ args: { tokenId: expectedTokenId } } as unknown as Event]
				} as unknown as ContractReceipt);
			const txResponse = { wait: waitFake } as ContractTransaction;
			nftDriverContractStub.safeMint.withArgs(transferToAddress).resolves(txResponse);

			// Act
			const actualTokenId = await testNftDriverClient.safeMint(transferToAddress);

			// Assert
			assert.equal(actualTokenId, expectedTokenId);
			assert(
				nftDriverContractStub.safeMint.calledOnceWithExactly(transferToAddress),
				'Expected method to be called with different arguments'
			);
		});
	});

	describe('collect()', () => {
		it('should throw argumentMissingError when tokenId is missing', async () => {
			// Arrange
			let threw = false;
			const testAddress = Wallet.createRandom().address;

			try {
				// Act
				await testNftDriverClient.collect(undefined as unknown as bigint, testAddress, testAddress);
			} catch (error: any) {
				// Assert
				assert.equal(error.code, DripsErrorCode.MISSING_ARGUMENT);
				threw = true;
			}

			// Assert
			assert.isTrue(threw, 'Expected type of exception was not thrown');
		});

		it('should validate the ERC20 and transferTo addresses', async () => {
			// Arrange
			const tokenId = 1;
			const tokenAddress = Wallet.createRandom().address;
			const transferToAddress = Wallet.createRandom().address;
			const validateAddressStub = sinon.stub(internals, 'validateAddress');

			// Act
			await testNftDriverClient.collect(tokenId, tokenAddress, transferToAddress);

			// Assert
			assert(
				validateAddressStub.calledWithExactly(tokenAddress),
				'Expected method to be called with different arguments'
			);
			assert(
				validateAddressStub.calledWithExactly(transferToAddress),
				'Expected method to be called with different arguments'
			);
		});

		it('should call the collect() method of the NFTDriver contract', async () => {
			// Arrange
			const tokenId = 1;
			const tokenAddress = Wallet.createRandom().address;
			const transferToAddress = Wallet.createRandom().address;

			// Act
			await testNftDriverClient.collect(tokenId, tokenAddress, transferToAddress);

			// Assert
			assert(
				nftDriverContractStub.collect.calledOnceWithExactly(tokenId, tokenAddress, transferToAddress),
				'Expected method to be called with different arguments'
			);
		});
	});

	describe('give()', () => {
		it('should throw argumentMissingError when tokenId is missing', async () => {
			// Arrange
			let threw = false;
			const tokenAddress = Wallet.createRandom().address;

			try {
				// Act
				await testNftDriverClient.give(undefined as unknown as bigint, '1', tokenAddress, 1);
			} catch (error: any) {
				// Assert
				assert.equal(error.code, DripsErrorCode.MISSING_ARGUMENT);
				threw = true;
			}

			// Assert
			assert.isTrue(threw, 'Expected type of exception was not thrown');
		});

		it('should throw argumentMissingError when receiverUserId is missing', async () => {
			// Arrange
			let threw = false;
			const tokenAddress = Wallet.createRandom().address;

			try {
				// Act
				await testNftDriverClient.give(1, undefined as unknown as string, tokenAddress, 1);
			} catch (error: any) {
				// Assert
				assert.equal(error.code, DripsErrorCode.MISSING_ARGUMENT);
				threw = true;
			}

			// Assert
			assert.isTrue(threw, 'Expected type of exception was not thrown');
		});

		it('should throw argumentMissingError when amount is less than or equal to 0', async () => {
			// Arrange
			let threw = false;
			const tokenAddress = Wallet.createRandom().address;

			try {
				// Act
				await testNftDriverClient.give(1, ' 1', tokenAddress, -1);
			} catch (error: any) {
				// Assert
				assert.equal(error.code, DripsErrorCode.INVALID_ARGUMENT);
				threw = true;
			}

			// Assert
			assert.isTrue(threw, 'Expected type of exception was not thrown');
		});

		it('should validate the ERC20 address', async () => {
			// Arrange
			const tokenId = 1;
			const tokenAddress = Wallet.createRandom().address;
			const validateAddressStub = sinon.stub(internals, 'validateAddress');

			// Act
			await testNftDriverClient.give(tokenId, ' 1', tokenAddress, 1);

			// Assert
			assert(validateAddressStub.calledOnceWithExactly(tokenAddress));
		});

		it('should call the give() method of the NFTDriver contract', async () => {
			// Arrange
			const tokenId = 1;
			const amount = 100;
			const receiverUserId = '1';
			const tokenAddress = Wallet.createRandom().address;

			// Act
			await testNftDriverClient.give(tokenId, receiverUserId, tokenAddress, amount);

			// Assert
			assert(
				nftDriverContractStub.give.calledOnceWithExactly(tokenId, receiverUserId, tokenAddress, amount),
				'Expected method to be called with different arguments'
			);
		});
	});

	describe('setDrips()', () => {
		it('should throw argumentMissingError when tokenId is missing', async () => {
			// Arrange
			let threw = false;
			const tokenAddress = Wallet.createRandom().address;
			const transferToAddress = Wallet.createRandom().address;

			try {
				// Act
				await testNftDriverClient.setDrips(
					undefined as unknown as BigNumberish,
					tokenAddress,
					[],
					[],
					transferToAddress,
					1
				);
			} catch (error: any) {
				// Assert
				assert.equal(error.code, DripsErrorCode.MISSING_ARGUMENT);
				threw = true;
			}

			// Assert
			assert.isTrue(threw, 'Expected type of exception was not thrown');
		});

		it('should validate the ERC20 address', async () => {
			// Arrange
			const tokenId = 1;
			const tokenAddress = Wallet.createRandom().address;
			const transferToAddress = Wallet.createRandom().address;
			const currentReceivers: DripsReceiverStruct[] = [
				{
					userId: 3,
					config: Utils.DripsReceiverConfiguration.toUint256({ dripId: 1n, amountPerSec: 3n, duration: 3n, start: 3n })
				}
			];
			const receivers: DripsReceiverStruct[] = [
				{
					userId: 2,
					config: Utils.DripsReceiverConfiguration.toUint256({ dripId: 1n, amountPerSec: 1n, duration: 1n, start: 1n })
				},
				{
					userId: 2,
					config: Utils.DripsReceiverConfiguration.toUint256({ dripId: 1n, amountPerSec: 1n, duration: 1n, start: 1n })
				},
				{
					userId: 1,
					config: Utils.DripsReceiverConfiguration.toUint256({ dripId: 1n, amountPerSec: 2n, duration: 2n, start: 2n })
				}
			];

			const validateAddressStub = sinon.stub(internals, 'validateAddress');

			// Act
			await testNftDriverClient.setDrips(tokenId, tokenAddress, currentReceivers, receivers, transferToAddress, 1n);

			// Assert
			assert(validateAddressStub.calledOnceWithExactly(tokenAddress));
		});

		it('should validate the drips receivers', async () => {
			// Arrange
			const tokenId = 1;
			const tokenAddress = Wallet.createRandom().address;
			const transferToAddress = Wallet.createRandom().address;

			const currentReceivers: DripsReceiverStruct[] = [
				{
					userId: '3',
					config: Utils.DripsReceiverConfiguration.toUint256({ dripId: 1n, amountPerSec: 3n, duration: 3n, start: 3n })
				}
			];
			const receivers: DripsReceiverStruct[] = [
				{
					userId: '2',
					config: Utils.DripsReceiverConfiguration.toUint256({ dripId: 1n, amountPerSec: 1n, duration: 1n, start: 1n })
				},
				{
					userId: '2',
					config: Utils.DripsReceiverConfiguration.toUint256({ dripId: 1n, amountPerSec: 1n, duration: 1n, start: 1n })
				},
				{
					userId: '1',
					config: Utils.DripsReceiverConfiguration.toUint256({ dripId: 1n, amountPerSec: 2n, duration: 2n, start: 2n })
				}
			];

			const validateDripsReceiversStub = sinon.stub(internals, 'validateDripsReceivers');

			// Act
			await testNftDriverClient.setDrips(tokenId, tokenAddress, currentReceivers, receivers, transferToAddress, 1n);

			// Assert
			assert(
				validateDripsReceiversStub.calledWithExactly(
					sinon.match(
						(r: DripsReceiver[]) =>
							r[0].userId === receivers[0].userId &&
							r[1].userId === receivers[1].userId &&
							r[2].userId === receivers[2].userId
					)
				),
				'Expected method to be called with different arguments'
			);
			assert(
				validateDripsReceiversStub.calledWithExactly(
					sinon.match((r: DripsReceiver[]) => r[0].userId === currentReceivers[0].userId)
				),
				'Expected method to be called with different arguments'
			);
		});

		it('should throw argumentMissingError when current drips transferToAddress are missing', async () => {
			// Arrange
			let threw = false;

			// Act
			try {
				await testNftDriverClient.setDrips(
					1,
					Wallet.createRandom().address,
					[],
					[],
					undefined as unknown as string,
					0n
				);
			} catch (error: any) {
				// Assert
				assert.equal(error.code, DripsErrorCode.MISSING_ARGUMENT);
				threw = true;
			}

			// Assert
			assert.isTrue(threw, 'Expected type of exception was not thrown');
		});

		it('should clear drips when new receivers is an empty list', async () => {
			// Arrange
			const tokenId = 1;
			const tokenAddress = Wallet.createRandom().address;
			const transferToAddress = Wallet.createRandom().address;
			const currentReceivers: DripsReceiverStruct[] = [
				{
					userId: 3,
					config: Utils.DripsReceiverConfiguration.toUint256({ dripId: 1n, amountPerSec: 3n, duration: 3n, start: 3n })
				}
			];

			// Act
			await testNftDriverClient.setDrips(tokenId, tokenAddress, currentReceivers, [], transferToAddress, 1n);

			// Assert
			assert(
				nftDriverContractStub.setDrips.calledOnceWithExactly(
					tokenId,
					tokenAddress,
					currentReceivers,
					1n,
					[],
					transferToAddress
				),
				'Expected method to be called with different arguments'
			);
		});

		it('should set balanceDelta to the default value of 0 when balanceDelta is not provided', async () => {
			// Arrange
			const tokenId = 1;
			const tokenAddress = Wallet.createRandom().address;
			const transferToAddress = Wallet.createRandom().address;

			// Act
			await testNftDriverClient.setDrips(
				tokenId,
				tokenAddress,
				[],
				[],
				transferToAddress,
				undefined as unknown as bigint
			);

			// Assert
			assert(
				nftDriverContractStub.setDrips.calledOnceWithExactly(tokenId, tokenAddress, [], 0, [], transferToAddress),
				'Expected method to be called with different arguments'
			);
		});

		it('should call the setDrips() method of the NFTDriver contract', async () => {
			// Arrange
			const tokenId = 1;
			const tokenAddress = Wallet.createRandom().address;
			const transferToAddress = Wallet.createRandom().address;
			const currentReceivers: DripsReceiverStruct[] = [
				{
					userId: 3n,
					config: Utils.DripsReceiverConfiguration.toUint256({ dripId: 1n, amountPerSec: 3n, duration: 3n, start: 3n })
				}
			];
			const newReceivers: DripsReceiverStruct[] = [
				{
					userId: 2n,
					config: Utils.DripsReceiverConfiguration.toUint256({ dripId: 1n, amountPerSec: 1n, duration: 1n, start: 1n })
				},
				{
					userId: 2n,
					config: Utils.DripsReceiverConfiguration.toUint256({ dripId: 1n, amountPerSec: 1n, duration: 1n, start: 1n })
				},
				{
					userId: 1n,
					config: Utils.DripsReceiverConfiguration.toUint256({ dripId: 1n, amountPerSec: 2n, duration: 2n, start: 2n })
				}
			];

			sinon
				.stub(internals, 'formatDripsReceivers')
				.onFirstCall()
				.returns(currentReceivers)
				.onSecondCall()
				.returns(newReceivers);

			// Act
			await testNftDriverClient.setDrips(tokenId, tokenAddress, currentReceivers, newReceivers, transferToAddress, 1);

			// Assert
			assert(
				nftDriverContractStub.setDrips.calledOnceWithExactly(
					tokenId,
					tokenAddress,
					currentReceivers,
					1,
					newReceivers,
					transferToAddress
				),
				'Expected method to be called with different arguments'
			);
		});
	});

	describe('setSplits()', () => {
		it('should throw argumentMissingError when tokenId is missing', async () => {
			// Arrange
			let threw = false;

			// Act
			try {
				await testNftDriverClient.setSplits(undefined as unknown as BigNumberish, []);
			} catch (error: any) {
				// Assert
				assert.equal(error.code, DripsErrorCode.MISSING_ARGUMENT);
				threw = true;
			}

			// Assert
			assert.isTrue(threw, 'Expected type of exception was not thrown');
		});

		it('should throw argumentMissingError when splits receivers are missing', async () => {
			// Arrange
			let threw = false;

			// Act
			try {
				await testNftDriverClient.setSplits(1, undefined as unknown as SplitsReceiverStruct[]);
			} catch (error: any) {
				// Assert
				assert.equal(error.code, DripsErrorCode.MISSING_ARGUMENT);
				threw = true;
			}

			// Assert
			assert.isTrue(threw, 'Expected type of exception was not thrown');
		});

		it('clears splits when new receivers is an empty list', async () => {
			// Arrange
			const tokenId = 1;

			// Act
			await testNftDriverClient.setSplits(tokenId, []);

			// Assert
			assert(
				nftDriverContractStub.setSplits.calledOnceWithExactly(tokenId, []),
				'Expected method to be called with different arguments'
			);
		});

		it('should validate the splits receivers', async () => {
			// Arrange
			const tokenId = 1;

			const receivers: SplitsReceiverStruct[] = [
				{ userId: 1, weight: 1 },
				{ userId: 2, weight: 2 }
			];

			const validateSplitsReceiversStub = sinon.stub(internals, 'validateSplitsReceivers');

			// Act
			await testNftDriverClient.setSplits(tokenId, receivers);

			// Assert
			assert(validateSplitsReceiversStub.calledOnceWithExactly(receivers));
		});

		it('should call the setSplits() method of the NFTDriver contract', async () => {
			// Arrange
			const tokenId = 1;

			const receivers: SplitsReceiverStruct[] = [
				{ userId: 2, weight: 100 },
				{ userId: 1, weight: 1 },
				{ userId: 1, weight: 1 }
			];

			// Act
			await testNftDriverClient.setSplits(tokenId, receivers);

			// Assert
			assert(
				nftDriverContractStub.setSplits.calledOnceWithExactly(
					tokenId,
					sinon
						.match((r: SplitsReceiverStruct[]) => r.length === 2)
						.and(sinon.match((r: SplitsReceiverStruct[]) => r[0].userId === 1))
						.and(sinon.match((r: SplitsReceiverStruct[]) => r[1].userId === 2))
				),
				'Expected method to be called with different arguments'
			);
		});
	});

	describe('emitUserMetadata()', () => {
		it('should throw argumentMissingError when tokenId is missing', async () => {
			// Arrange
			let threw = false;

			// Act
			try {
				await testNftDriverClient.emitUserMetadata(undefined as unknown as BigNumberish, 'key', 'value');
			} catch (error: any) {
				// Assert
				assert.equal(error.code, DripsErrorCode.MISSING_ARGUMENT);
				threw = true;
			}

			// Assert
			assert.isTrue(threw, 'Expected type of exception was not thrown');
		});

		it('should throw argumentMissingError when key missing', async () => {
			// Arrange
			let threw = false;

			// Act
			try {
				await testNftDriverClient.emitUserMetadata(1, undefined as unknown as BigNumberish, 'value');
			} catch (error: any) {
				// Assert
				assert.equal(error.code, DripsErrorCode.MISSING_ARGUMENT);
				threw = true;
			}

			// Assert
			assert.isTrue(threw, 'Expected type of exception was not thrown');
		});

		it('should throw argumentMissingError when value missing', async () => {
			// Arrange
			let threw = false;

			// Act
			try {
				await testNftDriverClient.emitUserMetadata(1, 'key', undefined as unknown as BytesLike);
			} catch (error: any) {
				// Assert
				assert.equal(error.code, DripsErrorCode.MISSING_ARGUMENT);
				threw = true;
			}

			// Assert
			assert.isTrue(threw, 'Expected type of exception was not thrown');
		});

		it('should call the emitUserMetadata() method of the NFTDriver contract', async () => {
			// Arrange
			const tokenId = 1;
			const key = '1';
			const value = 'value';

			// Act
			await testNftDriverClient.emitUserMetadata(tokenId, key, value);

			// Assert
			assert(
				nftDriverContractStub.emitUserMetadata.calledOnceWithExactly(tokenId, key, value),
				'Expected method to be called with different arguments'
			);
		});
	});
});