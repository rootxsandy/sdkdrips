import type { CallStruct } from 'contracts/Caller';
import type { BigNumberish } from 'ethers';
import { ethers, BigNumber } from 'ethers';
import {
	validateCollectInput,
	validateEmitUserMetadataInput,
	validateReceiveDripsInput,
	validateSetDripsInput,
	validateSplitInput
} from '../common/validators';
import { formatDripsReceivers, isNullOrUndefined, nameOf } from '../common/internals';
import Utils from '../utils';
import type { DripsReceiverStruct, Preset, SplitsReceiverStruct } from '../common/types';
import { DripsErrors } from '../common/DripsError';
import { NFTDriver__factory, DripsHub__factory } from '../../contracts/factories';

export namespace NFTDriverPresets {
	export type NewStreamFlowPayload = {
		tokenId: string;
		driverAddress: string;
		tokenAddress: string;
		currentReceivers: DripsReceiverStruct[];
		newReceivers: DripsReceiverStruct[];
		balanceDelta: BigNumberish;
		transferToAddress: string;
		key: BigNumberish;
		value: string;
	};

	export type CollectFlowPayload = {
		tokenId: string;
		driverAddress: string;
		dripsHubAddress: string;
		userId: string;
		tokenAddress: string;
		maxCycles: BigNumberish;
		currentReceivers: SplitsReceiverStruct[];
		transferToAddress: string;
	};

	/**
 * Pre-configured sets of contract calls that can be used as input to `Caller.callBatched` method.
 * @see `CallerClient` for more.
 *
 *
 * @example <caption>Example usage of `collectFlow`.</caption>
 * // Create a new `Caller`.
 * const caller = await CallerClient.create(provider);
 *
 * // Populate the flow's payload.
	const flowPayload: NFTDriverPresets.CollectFlowPayload = {
		driverAddress,
		dripsHubAddress,
		userId,
		tokenAddress,
		maxCycles,
		currentReceivers,
		transferToAddress
	};

	// Create a new `collectFlow` preset.
	const collectFlow = NFTDriverPresets.Presets.collectFlow(flowPayload);

	// Pass the preset to the `Caller`.
	const tx = await caller.callBatched(collectFlow);
	await tx.wait();
	*/
	export class Presets {
		/**
		 * Creates a new batch with the following sequence of calls:
		 * 1. `setDrips`
		 * 2. `emitUserMetadata`
		 *
		 * @see `NFTDriverClient`'s API for more details.
		 * @param  {CreateStreamFlowPayload} payload the flow's payload.
		 * @returns The preset.
		 * @throws {@link DripsErrors.addressError} if `payload.tokenAddress` or `payload.transferToAddress` is not valid.
		 * @throws {@link DripsErrors.argumentMissingError} if any of the required parameters is missing.
		 * @throws {@link DripsErrors.argumentError} if `payload.currentReceivers`' or `payload.newReceivers`' count exceeds the max allowed drips receivers.
		 * @throws {@link DripsErrors.dripsReceiverError} if any of the `payload.currentReceivers` or the `payload.newReceivers` is not valid.
		 * @throws {@link DripsErrors.dripsReceiverConfigError} if any of the receivers' configuration is not valid.
		 */
		public static createNewStreamFlow(payload: NewStreamFlowPayload): Preset {
			if (isNullOrUndefined(payload)) {
				throw DripsErrors.argumentMissingError(
					`Could not create stream flow: '${nameOf({ payload })}' is missing.`,
					nameOf({ payload })
				);
			}

			const {
				key,
				value,
				tokenId,
				tokenAddress,
				driverAddress,
				newReceivers,
				balanceDelta,
				currentReceivers,
				transferToAddress
			} = payload;

			if (isNullOrUndefined(tokenId)) {
				throw DripsErrors.argumentError(
					`Could not create stream flow: '${nameOf({ tokenId })}' is missing.`,
					nameOf({ tokenId }),
					tokenId
				);
			}

			validateSetDripsInput(
				tokenAddress,
				currentReceivers?.map((r) => ({
					userId: r.userId.toString(),
					config: Utils.DripsReceiverConfiguration.fromUint256(BigNumber.from(r.config).toBigInt())
				})),
				newReceivers?.map((r) => ({
					userId: r.userId.toString(),
					config: Utils.DripsReceiverConfiguration.fromUint256(BigNumber.from(r.config).toBigInt())
				})),
				transferToAddress,
				balanceDelta
			);
			validateEmitUserMetadataInput(key, value);

			const setDrips: CallStruct = {
				value: 0,
				to: driverAddress,
				data: NFTDriver__factory.createInterface().encodeFunctionData('setDrips', [
					tokenId,
					tokenAddress,
					formatDripsReceivers(currentReceivers),
					balanceDelta,
					formatDripsReceivers(newReceivers),
					transferToAddress
				])
			};

			const emitUserMetadata: CallStruct = {
				value: 0,
				to: driverAddress,
				data: NFTDriver__factory.createInterface().encodeFunctionData('emitUserMetadata', [
					tokenId,
					key,
					ethers.utils.hexlify(ethers.utils.toUtf8Bytes(value))
				])
			};

			return [setDrips, emitUserMetadata];
		}

		/**
		 * Creates a new batch with the following sequence of calls:
		 * 1. `receiveDrips`
		 * 2. `split`
		 * 3. `collect`
		 *
		 * @see `NFTDriverClient` and `DripsHubClient`'s API for more details.
		 * @param  {CollectFlowPayload} payload the flow's payload.
		 * @returns The preset.
		 * @throws {@link DripsErrors.addressError} if `payload.tokenAddress` or the `payload.transferToAddress` address is not valid.
		 * @throws {@link DripsErrors.argumentMissingError} if any of the required parameters is missing.
		 * @throws {@link DripsErrors.argumentError} if `payload.maxCycles` or `payload.currentReceivers` is not valid.
		 * @throws {@link DripsErrors.splitsReceiverError} if any of the `payload.currentReceivers` is not valid.
		 */
		public static createCollectFlow(payload: CollectFlowPayload): Preset {
			if (isNullOrUndefined(payload)) {
				throw DripsErrors.argumentMissingError(
					`Could not create collect flow: '${nameOf({ payload })}' is missing.`,
					nameOf({ payload })
				);
			}

			const {
				tokenId,
				driverAddress,
				dripsHubAddress,
				userId,
				tokenAddress,
				maxCycles,
				currentReceivers,
				transferToAddress
			} = payload;

			if (isNullOrUndefined(tokenId)) {
				throw DripsErrors.argumentError(
					`Could not create collect flow: '${nameOf({ tokenId })}' is missing.`,
					nameOf({ tokenId }),
					tokenId
				);
			}

			validateCollectInput(tokenAddress, transferToAddress);
			validateSplitInput(userId, tokenAddress, currentReceivers);
			validateReceiveDripsInput(userId, tokenAddress, maxCycles);

			const receive: CallStruct = {
				value: 0,
				to: dripsHubAddress,
				data: DripsHub__factory.createInterface().encodeFunctionData('receiveDrips', [userId, tokenAddress, maxCycles])
			};

			const split: CallStruct = {
				value: 0,
				to: dripsHubAddress,
				data: DripsHub__factory.createInterface().encodeFunctionData('split', [userId, tokenAddress, currentReceivers])
			};

			const collect: CallStruct = {
				value: 0,
				to: driverAddress,
				data: NFTDriver__factory.createInterface().encodeFunctionData('collect', [
					tokenId,
					tokenAddress,
					transferToAddress
				])
			};

			return [receive, split, collect];
		}
	}
}